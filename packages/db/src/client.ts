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

export async function migrateDb(url: string) {
  const { db, pool } = createDb(url, 1);
  try {
    await migrateNodePg(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}
