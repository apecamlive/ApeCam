import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
/** Works for both node-postgres (production) and PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export const MIGRATIONS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

/**
 * Pool settings from the environment:
 * - DATABASE_POOL_MAX caps connections per process (managed Postgres such as Supabase limits pooler clients).
 * - DATABASE_CA_CERT (PEM; "\n" escapes allowed) verifies the server against that CA. Needed for Supabase,
 *   whose certificates chain to Supabase's own root, which Node does not trust by default. Any sslmode in the
 *   URL is dropped in that case so the explicit, verifying TLS config applies (pg lets URL params win).
 */
export function poolConfig(url: string, max: number, env: Record<string, string | undefined> = process.env) {
  const fromEnv = Number(env.DATABASE_POOL_MAX);
  const config: pg.PoolConfig = {
    connectionString: url,
    max: Number.isInteger(fromEnv) && fromEnv > 0 ? Math.min(fromEnv, max) : max,
  };
  const ca = env.DATABASE_CA_CERT?.trim();
  if (ca) {
    const u = new URL(url);
    for (const p of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'])
      u.searchParams.delete(p);
    config.connectionString = u.toString();
    config.ssl = { ca: ca.replaceAll('\\n', '\n'), rejectUnauthorized: true };
  }
  return config;
}

export function createDb(url: string, max = 10) {
  const pool = new pg.Pool(poolConfig(url, max));
  const db = drizzleNodePg(pool, { schema });
  return { db: db as unknown as Db, pool };
}

/** Arbitrary constant: the Postgres advisory-lock key that serialises migrations. */
const MIGRATION_LOCK_KEY = 4_663_000_001;

/**
 * Applies pending migrations. Safe to run from several processes at once (e.g. two web replicas starting
 * together): the pool has a single connection, which holds a session advisory lock for the whole run.
 */
export async function migrateDb(url: string) {
  const { db, pool } = createDb(url, 1);
  try {
    await pool.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await migrateNodePg(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await pool.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await pool.end();
  }
}
