import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { streams, tokens, users, wallets } from './schema';
import { createTestDb } from './testing';

type Rows = { rows: Record<string, unknown>[] };

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

async function seedUserWithWallets(n: number) {
  const [user] = await t.db.insert(users).values({}).returning();
  const ws = await t.db
    .insert(wallets)
    .values(
      Array.from({ length: n }, (_, i) => ({
        userId: user!.id,
        chainFamily: 'evm' as const,
        address: `0x${user!.id.replaceAll('-', '').slice(0, 30)}${i.toString().padStart(10, '0')}`,
        verifiedAt: new Date(),
      })),
    )
    .returning();
  return { user: user!, wallets: ws };
}

describe('schema', () => {
  it('applies all migrations (pg_trgm available)', async () => {
    const res = (await t.db.execute(sql`select extname from pg_extension where extname = 'pg_trgm'`)) as Rows;
    expect(res.rows).toHaveLength(1);
  });

  it('D15 · a wallet cannot have two active streams', async () => {
    const [token] = await t.db.insert(tokens).values({ chain: 'base', contract: '0xaaa' }).returning();
    const {
      user,
      wallets: [w],
    } = await seedUserWithWallets(1);
    const base = {
      tokenId: token!.id,
      userId: user.id,
      walletId: w!.id,
      title: 'gm',
      source: 'camera' as const,
    };
    await t.db.insert(streams).values({ ...base, status: 'live', livekitRoom: 's_1' });
    await expect(
      t.db.insert(streams).values({ ...base, status: 'starting', livekitRoom: 's_2' }),
    ).rejects.toThrow();
    // An ended stream does not block a new one.
    await t.db.insert(streams).values({ ...base, status: 'ended', livekitRoom: 's_3' });
  });

  it('D15 · two wallets of the same user may each be live', async () => {
    const [token] = await t.db.insert(tokens).values({ chain: 'base', contract: '0xbbb' }).returning();
    const { user, wallets: ws } = await seedUserWithWallets(2);
    for (const [i, w] of ws.entries()) {
      await t.db.insert(streams).values({
        tokenId: token!.id,
        userId: user.id,
        walletId: w.id,
        title: 'gm',
        source: 'camera',
        status: 'live',
        livekitRoom: `s_multi_${i}`,
      });
    }
  });

  it('one payout wallet per user', async () => {
    const {
      wallets: [a, b],
    } = await seedUserWithWallets(2);
    await t.db
      .update(wallets)
      .set({ isPayout: true })
      .where(sql`${wallets.id} = ${a!.id}`);
    await expect(
      t.db
        .update(wallets)
        .set({ isPayout: true })
        .where(sql`${wallets.id} = ${b!.id}`),
    ).rejects.toThrow();
  });

  it('trigram ticker search finds near matches', async () => {
    await t.db.insert(tokens).values([
      { chain: 'solana', contract: 'm1', ticker: 'PEPE' },
      { chain: 'base', contract: 'm2', ticker: 'PEPE2' },
      { chain: 'bsc', contract: 'm3', ticker: 'DOGE' },
    ]);
    const res = (await t.db.execute(
      sql`select ticker from tokens where ticker % 'PEPE' order by similarity(ticker, 'PEPE') desc`,
    )) as Rows;
    expect(res.rows.map((r) => (r as { ticker: string }).ticker)).toEqual(['PEPE', 'PEPE2']);
  });
});
