/**
 * Throwaway database for Playwright E2E: in-memory PGlite, migrated and seeded, behind the Postgres wire
 * protocol. Started by apps/web/playwright.config.ts; every run starts from the same data.
 *   E2E_DB_PORT (default 54330), E2E_ADMIN_ADDRESS (lowercase 0x address that becomes admin).
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER } from './client';
import * as schema from './schema';
import { streams, tokens, users, wallets } from './schema';

const port = Number(process.env.E2E_DB_PORT ?? 54330);
const adminAddress = process.env.E2E_ADMIN_ADDRESS?.toLowerCase();

const pglite = await PGlite.create({ extensions: { pg_trgm } });
const db = drizzle(pglite, { schema });
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const now = new Date();
const TOKENS = [
  {
    chain: 'base',
    contract: '0x00000000000000000000000000000000000e2e01',
    ticker: 'APEX',
    name: 'Ape Example',
  },
  {
    chain: 'base',
    contract: '0x00000000000000000000000000000000000e2e02',
    ticker: 'MOON',
    name: 'Moon Test',
  },
];
const tokenRows = await db
  .insert(tokens)
  .values(
    TOKENS.map((t) => ({
      ...t,
      decimals: 18,
      priceUsd: '0.0123',
      marketCapUsd: '1200000',
      change24h: '12.5',
      liquidityUsd: '80000',
      logoSource: 'placeholder' as const,
      updatedAt: now, // fresh: the token API does not call chains or DexScreener during E2E
    })),
  )
  .returning();

// Titles include an XSS payload: the E2E suite checks it renders as text (T-S4-I4).
const LIVE = [
  { title: 'gm apes, charts + chill', token: 0, name: 'e2e_streamer_a', viewers: 42 },
  { title: `<img src=x onerror="window.__xss=1">xss check`, token: 0, name: 'e2e_streamer_b', viewers: 7 },
  { title: 'moon mission live', token: 1, name: 'e2e_streamer_c', viewers: 3 }, // reported + killed
  { title: 'ban target stream', token: 1, name: 'e2e_streamer_d', viewers: 1 }, // banned
];
for (const [i, s] of LIVE.entries()) {
  const [user] = await db
    .insert(users)
    .values({ displayName: s.name, createdAt: new Date(0) })
    .returning();
  const [wallet] = await db
    .insert(wallets)
    .values({
      userId: user!.id,
      chainFamily: 'evm',
      address: `0x00000000000000000000000000000000000e2ea${i}`,
      verifiedAt: now,
    })
    .returning();
  await db.insert(streams).values({
    tokenId: tokenRows[s.token]!.id,
    userId: user!.id,
    walletId: wallet!.id,
    title: s.title,
    source: 'camera',
    status: 'live',
    livekitRoom: `s_e2e_${i}`,
    currentViewers: s.viewers,
    peakViewers: s.viewers,
    startedAt: new Date(now.getTime() - (i + 1) * 10 * 60_000),
  });
}

if (adminAddress) {
  const [admin] = await db.insert(users).values({ displayName: 'e2e_admin', role: 'admin' }).returning();
  await db
    .insert(wallets)
    .values({ userId: admin!.id, chainFamily: 'evm', address: adminAddress, verifiedAt: now });
}

const server = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1', maxConnections: 20 } as never);
await server.start();
console.log(`E2E database ready on ${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop();
    await pglite.close();
    process.exit(0);
  });
}
