import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_TABLES, decodeBackup, encodeBackup, exportBackup, restoreBackup } from './backup';
import { appConfig, payoutBatches, rewards, streams, syncCursors, tokens, users, wallets } from './schema';
import { createTestDb } from './testing';

const open: { close: () => Promise<void> }[] = [];
async function db() {
  const t = await createTestDb();
  open.push(t);
  return t.db;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((t) => t.close()));
});

async function seed(d: Awaited<ReturnType<typeof db>>) {
  const [user] = await d.insert(users).values({ displayName: 'ape "quoted" ☕', role: 'admin' }).returning();
  const [w] = await d
    .insert(wallets)
    .values({
      userId: user!.id,
      chainFamily: 'evm',
      address: '0xabc',
      verifiedAt: new Date(),
      isPayout: true,
    })
    .returning();
  const [token] = await d
    .insert(tokens)
    .values({ chain: 'base', contract: '0xtok', ticker: 'APE', priceUsd: '0.000000123456789012' })
    .returning();
  await d.insert(streams).values({
    tokenId: token!.id,
    userId: user!.id,
    walletId: w!.id,
    title: 'gm <script>',
    source: 'camera',
    status: 'ended',
    livekitRoom: 's_backup',
  });
  const [batch] = await d
    .insert(payoutBatches)
    .values({
      periodFrom: '2026-09-21',
      periodTo: '2026-09-27',
      totalApecam: '5000000000000000000000',
      scaleFactor: '0.8',
      status: 'paid',
      createdBy: user!.id,
    })
    .returning();
  await d.insert(rewards).values({
    userId: user!.id,
    period: '2026-09-22',
    validMinutes: 100,
    apecamAmount: '4000000000000000000000',
    scaleFactor: '0.8',
    status: 'paid',
    payoutBatchId: batch!.id,
  });
  await d.insert(syncCursors).values({ name: 'tracker:robinhood', lastBlock: 9_007_199_254_740 });
  await d.insert(appConfig).values({
    key: 's2e.tiers',
    value: [
      [10, 1000],
      [100, 5000],
    ],
    updatedBy: user!.id,
  });
}

/** Every backed-up table as JSON text, ordered, so two databases can be compared exactly. */
async function dump(d: Awaited<ReturnType<typeof db>>) {
  const out: Record<string, string[]> = {};
  for (const t of BACKUP_TABLES) {
    const res = (await d.execute(sql`select row_to_json(x)::text as j from ${sql.identifier(t)} x`)) as {
      rows: { j: string }[];
    };
    out[t] = res.rows.map((r) => r.j).sort();
  }
  return out;
}

describe('S4-10 · backup and restore', () => {
  it('T-S4-M2 (auto) · round trip restores every row exactly (numeric, bigint, jsonb, dates, unicode)', async () => {
    const source = await db();
    await seed(source);
    const bytes = encodeBackup(await exportBackup(source));
    expect(bytes[0]).toBe(0x1f); // gzip

    const target = await db();
    const counts = await restoreBackup(target, decodeBackup(bytes));
    expect(counts).toMatchObject({ users: 1, wallets: 1, streams: 1, rewards: 1, app_config: 1 });
    expect(await dump(target)).toEqual(await dump(source));
  });

  it('refuses to restore over data unless replace is set', async () => {
    const source = await db();
    await seed(source);
    const backup = await exportBackup(source);
    const target = await db();
    await target.insert(users).values({});
    await expect(restoreBackup(target, backup)).rejects.toThrow(/not empty/);
    await restoreBackup(target, backup, { replace: true });
    expect(await dump(target)).toEqual(await dump(source));
  });

  it('a failed restore leaves the target untouched', async () => {
    const source = await db();
    await seed(source);
    const backup = await exportBackup(source);
    backup.tables.rewards = [{ id: 'not-a-uuid' }];
    const target = await db();
    await expect(restoreBackup(target, backup)).rejects.toThrow();
    const res = (await target.execute(sql`select count(*)::int as n from users`)) as {
      rows: { n: number }[];
    };
    expect(res.rows[0]!.n).toBe(0);
  });
});
