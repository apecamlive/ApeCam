import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER } from './client';
import * as schema from './schema';

/**
 * Local Postgres without Docker: PGlite (persistent, in ./.pgdata) behind a Postgres wire-protocol
 * socket, so the web app and worker connect with a normal DATABASE_URL.
 *   pnpm --filter @apecam/db dev   →   postgres://postgres@127.0.0.1:54329/postgres
 * PGlite handles one connection at a time; fine for local QA, not for load tests.
 */
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.pgdata');
const port = Number(process.env.PGLITE_PORT ?? 54329);

const db = await PGlite.create({ dataDir, extensions: { pg_trgm } });
await migrate(drizzle(db, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 } as never);
await server.start();
console.log(`PGlite dev database ready: postgres://postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}
