import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER, type Db } from './client';
import * as schema from './schema';

let template: Promise<PGlite> | undefined;

/** Migrated once per test process; every test gets a cheap clone of it. */
function migratedTemplate() {
  template ??= (async () => {
    const client = new PGlite({ extensions: { pg_trgm } });
    await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
    return client;
  })();
  return template;
}

/**
 * In-process Postgres (PGlite, WASM) with all migrations applied.
 * Lets integration tests run without Docker; CI additionally runs against real Postgres.
 */
export async function createTestDb() {
  const client: PGliteInterface = await (await migratedTemplate()).clone();
  const db = drizzle(client as PGlite, { schema });
  return { db: db as unknown as Db, close: () => client.close() };
}
