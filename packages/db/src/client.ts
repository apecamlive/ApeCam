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

export function createDb(url: string, max = 10) {
  const pool = new pg.Pool({ connectionString: url, max });
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
