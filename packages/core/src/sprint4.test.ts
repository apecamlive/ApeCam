import { decodeBackup, tokens } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { banWallet, MASS_BAN_THRESHOLD } from './admin';
import { backupDatabase, monitorSystem, recordJobRun, systemHealth, trackerStatus } from './monitoring';
import { profileSeo, sitemapTokens, tokenSeo } from './seo';
import { startStream } from './streams';
import { createTestContext, TEST_EVM_TOKEN } from './testing';
import { syncTracker } from './tracker-sync';
import { handleLivekitEvent } from './webhooks';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => ctx.close());

async function goLive() {
  const { user, wallets } = await ctx.createUser();
  ctx.fund(wallets[0]!.address, 150);
  const s = await startStream(ctx.deps, {
    userId: user.id,
    walletId: wallets[0]!.id,
    chain: 'base',
    contract: TEST_EVM_TOKEN,
    title: 'gm frens',
    source: 'camera',
    rulesAccepted: true,
    ageConfirmed: true,
  });
  await handleLivekitEvent(ctx.deps, {
    event: 'track_published',
    room: { name: s.room },
    participant: { identity: `pub_${user.id}` },
  });
  return { user, wallet: wallets[0]!, ...s };
}

describe('S4-4 · SEO lookups', () => {
  it('token metadata comes from the database only; unknown or hidden tokens → null', async () => {
    expect(await tokenSeo(ctx.deps, 'base', TEST_EVM_TOKEN)).toBeNull();
    await goLive();
    const seo = await tokenSeo(ctx.deps, 'base', TEST_EVM_TOKEN.toUpperCase().replace('0X', '0x'));
    expect(seo?.ticker).toBeTruthy();

    await ctx.db
      .update(tokens)
      .set({ hidden: true })
      .where(eq(tokens.contract, TEST_EVM_TOKEN.toLowerCase()));
    expect(await tokenSeo(ctx.deps, 'base', TEST_EVM_TOKEN)).toBeNull();
  });

  it('profile metadata includes the current live title', async () => {
    const { wallet } = await goLive();
    const seo = await profileSeo(ctx.deps, wallet.address);
    expect(seo).toMatchObject({ address: wallet.address, liveTitle: 'gm frens' });
    expect(await profileSeo(ctx.deps, '0x000000000000000000000000000000000000dEaD')).toBeNull();
  });

  it('sitemap lists token rooms streamed in the last 30 days, not hidden ones', async () => {
    await goLive();
    expect(await sitemapTokens(ctx.deps)).toHaveLength(1);
    ctx.advance(31 * 86_400_000);
    expect(await sitemapTokens(ctx.deps)).toHaveLength(0);
  });
});

describe('S4-9 · job monitoring', () => {
  const fail = (error = 'rpc down') => ({ ok: false as const, ms: 5, error });

  it('T-S4-M3 (auto) · three failures in a row alert once; recovery sends one note', async () => {
    await recordJobRun(ctx.deps, 'count-minutes', fail());
    await recordJobRun(ctx.deps, 'count-minutes', fail());
    expect(ctx.notifier.sent).toHaveLength(0);
    await recordJobRun(ctx.deps, 'count-minutes', fail());
    expect(ctx.notifier.sent).toHaveLength(1);
    expect(ctx.notifier.sent[0]).toContain('count-minutes failed 3 times');
    await recordJobRun(ctx.deps, 'count-minutes', fail());
    expect(ctx.notifier.sent).toHaveLength(1); // no repeat on the 4th

    await recordJobRun(ctx.deps, 'count-minutes', { ok: true, ms: 3 });
    expect(ctx.notifier.sent).toHaveLength(2);
    expect(ctx.notifier.sent[1]).toContain('recovered');
  });

  it('a success between failures resets the streak', async () => {
    await recordJobRun(ctx.deps, 'sync-tracker', fail());
    await recordJobRun(ctx.deps, 'sync-tracker', fail());
    await recordJobRun(ctx.deps, 'sync-tracker', { ok: true, ms: 1 });
    await recordJobRun(ctx.deps, 'sync-tracker', fail());
    expect(ctx.notifier.sent).toHaveLength(0);
  });

  it('health shows ok / failing / stalled / never_run per job', async () => {
    await recordJobRun(ctx.deps, 'count-minutes', { ok: true, ms: 1 });
    await recordJobRun(ctx.deps, 'frame-check', fail());
    await recordJobRun(ctx.deps, 'refresh-prices', { ok: true, ms: 1 });
    ctx.advance(60_000);
    await recordJobRun(ctx.deps, 'count-minutes', { ok: true, ms: 1 });
    ctx.advance(3 * 60_000);
    const health = await systemHealth(ctx.deps);
    const state = Object.fromEntries(health.jobs.map((j) => [j.name, j.state]));
    expect(state['count-minutes']).toBe('ok');
    expect(state['frame-check']).toBe('stalled');
    expect(state['refresh-prices']).toBe('stalled');
    expect(state['close-rewards']).toBe('never_run');
    expect(health.liveStreams).toBe(0);
  });

  it('tracker lag alerts at most once an hour', async () => {
    // Configured but never synced → lagging.
    expect(await monitorSystem(ctx.deps)).toMatchObject({ trackerLagging: true });
    expect(await monitorSystem(ctx.deps)).toMatchObject({ trackerLagging: true });
    expect(ctx.notifier.sent.filter((s) => s.includes('tracker'))).toHaveLength(1);

    await syncTracker(ctx.deps);
    expect(await monitorSystem(ctx.deps)).toMatchObject({ trackerLagging: false });
    ctx.advance(31 * 60_000);
    expect((await trackerStatus(ctx.deps)).lagging).toBe(true);
  });
});

describe('S4-7 · threat model: hijacked moderator', () => {
  it(`${MASS_BAN_THRESHOLD} bans by one moderator within an hour alert once`, async () => {
    const { user: mod } = await ctx.createUser({ role: 'moderator' });
    for (let i = 0; i < MASS_BAN_THRESHOLD + 2; i++) {
      const { wallets } = await ctx.createUser();
      await banWallet(ctx.deps, mod.id, wallets[0]!.address, 'permanent', `spam ${i}`);
      if (i < MASS_BAN_THRESHOLD - 1) expect(ctx.notifier.sent).toHaveLength(0);
    }
    expect(ctx.notifier.sent.filter((s) => s.includes('banned'))).toHaveLength(1);
    expect(ctx.notifier.sent[0]).toContain(`banned ${MASS_BAN_THRESHOLD} wallets`);
  });
});

describe('S4-10 · daily backup job', () => {
  it('uploads a gzipped backup to the private bucket, keyed by UTC date', async () => {
    await goLive();
    const res = await backupDatabase(ctx.deps);
    expect(res).toMatchObject({ key: 'db/2026-10-01.json.gz' });
    const stored = ctx.backups.stored.get('db/2026-10-01.json.gz')!;
    expect(stored.contentType).toBe('application/gzip');
    const backup = decodeBackup(stored.body);
    expect(backup.tables.streams).toHaveLength(1);
    expect(ctx.files.stored.size).toBe(0); // nothing in the public bucket
  });

  it('is skipped when no backup bucket is configured', async () => {
    expect(await backupDatabase({ ...ctx.deps, backups: undefined })).toEqual({
      skipped: 'R2_BACKUP_BUCKET not configured',
    });
  });
});
