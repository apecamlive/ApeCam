import { randomBytes } from 'node:crypto';
import { createDb } from './client';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const randomBase58 = (n: number) => [...randomBytes(n)].map((b) => B58[b % 58]).join('');
import { streams, tokens, users, wallets } from './schema';

/**
 * Demo data for local UI review: real token contracts (so prices/logos resolve) and a few fake
 * "live" streams so Home, Search and the token room have something to show. Never run in production.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production') throw new Error('seed-demo must not run in production');

const { db, pool } = createDb(url, 1);
const demoTokens = [
  {
    chain: 'solana',
    contract: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    ticker: 'Bonk',
    name: 'Bonk',
    decimals: 5,
    marketCapUsd: '1500000000',
  },
  {
    chain: 'base',
    contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    ticker: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    marketCapUsd: '4000000000',
  },
  {
    chain: 'robinhood',
    contract: '0xb8fa8010833463aac5595b55b9045479239eff79',
    ticker: 'ROBINHOOD',
    name: 'Robinhood',
    decimals: 18,
    marketCapUsd: '1686613',
  },
  {
    chain: 'solana',
    contract: 'So1Demo1111111111111111111111111111111111111',
    ticker: 'PEPE',
    name: 'Demo Pepe (Solana)',
    decimals: 6,
    marketCapUsd: '25000',
  },
  {
    chain: 'base',
    contract: '0x0000000000000000000000000000000000000abc',
    ticker: 'PEPE',
    name: 'Demo Pepe (Base)',
    decimals: 18,
    marketCapUsd: '900000',
  },
];

const rows = await db
  .insert(tokens)
  .values(demoTokens.map((t) => ({ ...t, logoSource: 'placeholder' as const, updatedAt: new Date(0) })))
  .onConflictDoNothing()
  .returning();
console.log(`tokens inserted: ${rows.length}`);

const titles = [
  'gm apes, charts + chill',
  'Robinhood Chain alpha hour',
  'bonk to the moon',
  'building in public',
];
for (const [i, title] of titles.entries()) {
  const [user] = await db
    .insert(users)
    .values({ displayName: i % 2 ? null : `demo_ape_${i}` })
    .returning();
  const [token] = await db
    .select()
    .from(tokens)
    .limit(1)
    .offset(i % 3);
  // Random address in the token's own chain family, as eligibility would require in the real flow.
  const solana = token!.chain === 'solana';
  const [wallet] = await db
    .insert(wallets)
    .values({
      userId: user!.id,
      chainFamily: solana ? 'solana' : 'evm',
      address: solana ? randomBase58(44) : `0x${randomBytes(20).toString('hex')}`,
      verifiedAt: new Date(),
    })
    .returning();
  await db.insert(streams).values({
    tokenId: token!.id,
    userId: user!.id,
    walletId: wallet!.id,
    title,
    source: 'camera',
    status: 'live',
    livekitRoom: `s_demo_${Date.now()}_${i}`,
    startedAt: new Date(Date.now() - (i + 1) * 7 * 60_000),
    currentViewers: [42, 7, 128, 3][i]!,
    peakViewers: [60, 9, 150, 3][i]!,
  });
}
console.log(`demo live streams inserted: ${titles.length}`);
await pool.end();
