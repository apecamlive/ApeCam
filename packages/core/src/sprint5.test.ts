import { streams } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { goLiveAccessFor, readGoLiveAccess } from './access';
import {
  inviteAddress,
  inviteWallets,
  killStream,
  listInvites,
  revokeInvite,
  setGoLiveAccess,
} from './admin';
import { createReport } from './moderation';
import { dailyOpsReport, monitorSystem, REPORT_SLA_MS } from './monitoring';
import { updateSetting } from './settings';
import { startStream } from './streams';
import { createTestContext, TEST_EVM_TOKEN } from './testing';
import { handleLivekitEvent } from './webhooks';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => ctx.close());

async function tryStart(userId: string, walletId: string, address: string) {
  ctx.fund(address, 150);
  return startStream(ctx.deps, {
    userId,
    walletId,
    chain: 'base',
    contract: TEST_EVM_TOKEN,
    title: 'beta stream',
    source: 'camera',
    rulesAccepted: true,
    ageConfirmed: true,
  });
}

async function streamer() {
  const { user, wallets } = await ctx.createUser();
  return { user, wallet: wallets[0]! };
}

async function goLive() {
  const s = await streamer();
  const res = await tryStart(s.user.id, s.wallet.id, s.wallet.address);
  await handleLivekitEvent(ctx.deps, {
    event: 'track_published',
    room: { name: res.room },
    participant: { identity: `pub_${s.user.id}` },
  });
  return { ...s, streamId: res.streamId };
}

describe('S5-1 · Go Live access (closed beta + emergency button)', () => {
  it('defaults to open', async () => {
    expect(await readGoLiveAccess(ctx.deps)).toBe('open');
    const s = await streamer();
    await expect(tryStart(s.user.id, s.wallet.id, s.wallet.address)).resolves.toBeTruthy();
  });

  it('T-S5-I1 · invite mode: only invited wallets and staff can go live', async () => {
    const { user: admin } = await ctx.createUser({ role: 'admin' });
    await setGoLiveAccess(ctx.deps, admin.id, 'invite', { reason: 'closed beta' });

    const outsider = await streamer();
    await expect(
      tryStart(outsider.user.id, outsider.wallet.id, outsider.wallet.address),
    ).rejects.toMatchObject({
      code: 'GO_LIVE_INVITE_ONLY',
    });

    const invited = await streamer();
    // Invites are by address and case-insensitive for EVM.
    await inviteWallets(
      ctx.deps,
      admin.id,
      [invited.wallet.address.toUpperCase().replace('0X', '0x')],
      'pons',
    );
    await expect(tryStart(invited.user.id, invited.wallet.id, invited.wallet.address)).resolves.toBeTruthy();

    const { user: mod, wallets } = await ctx.createUser({ role: 'moderator' });
    await expect(tryStart(mod.id, wallets[0]!.id, wallets[0]!.address)).resolves.toBeTruthy();
  });

  it('T-S5-I2 · emergency close blocks everyone immediately and can end every live stream', async () => {
    const { user: admin } = await ctx.createUser({ role: 'admin' });
    const a = await goLive();
    const b = await goLive();

    // No 60-second config cache: the very next start is refused.
    const res = await setGoLiveAccess(ctx.deps, admin.id, 'closed', { reason: 'raid', endLive: true });
    expect(res).toMatchObject({ before: 'open', mode: 'closed', streamsEnded: 2 });
    for (const id of [a.streamId, b.streamId]) {
      const [row] = await ctx.db.select().from(streams).where(eq(streams.id, id));
      expect(row).toMatchObject({ status: 'killed', endReason: 'admin_kill' });
    }
    const c = await streamer();
    await expect(tryStart(c.user.id, c.wallet.id, c.wallet.address)).rejects.toMatchObject({
      code: 'GO_LIVE_CLOSED',
    });
    // Staff cannot either: closed means closed.
    expect((await goLiveAccessFor(ctx.deps, admin.id)).allowed).toBe(false);
    expect(ctx.notifier.sent.at(-1)).toMatch(/Go Live is now "closed".*2 live streams ended/);

    await setGoLiveAccess(ctx.deps, admin.id, 'open', { reason: 'all clear' });
    await expect(tryStart(c.user.id, c.wallet.id, c.wallet.address)).resolves.toBeTruthy();
  });

  it('closing without endLive leaves running streams alone', async () => {
    const { user: admin } = await ctx.createUser({ role: 'admin' });
    const a = await goLive();
    await setGoLiveAccess(ctx.deps, admin.id, 'closed', { reason: 'pause new streams' });
    const [row] = await ctx.db.select().from(streams).where(eq(streams.id, a.streamId));
    expect(row!.status).toBe('live');
  });

  it('invites: validation, idempotent, listing shows sign-up, revoke', async () => {
    const { user: admin } = await ctx.createUser({ role: 'admin' });
    const s = await streamer();
    const sol = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const res = await inviteWallets(ctx.deps, admin.id, [s.wallet.address, sol, 'not-a-wallet', '', sol]);
    expect(res.invited).toHaveLength(2);
    expect(res.invalid).toEqual(['not-a-wallet']);
    await inviteWallets(ctx.deps, admin.id, [s.wallet.address]); // again: no error

    const list = await listInvites(ctx.deps);
    expect(list.find((i) => i.address === sol)?.signedUp).toBe(false);
    expect(list.find((i) => i.address === s.wallet.address)?.signedUp).toBe(true);

    await revokeInvite(ctx.deps, admin.id, sol);
    await expect(revokeInvite(ctx.deps, admin.id, sol)).rejects.toMatchObject({ code: 'INVITE_NOT_FOUND' });
    expect(inviteAddress('0xABCDEF0000000000000000000000000000000001')).toBe(
      '0xabcdef0000000000000000000000000000000001',
    );
  });

  it('generic config screen only accepts valid access modes and https feedback links', async () => {
    const { user: admin } = await ctx.createUser({ role: 'admin' });
    await expect(updateSetting(ctx.deps, admin.id, 'go_live.access', 'maybe')).rejects.toMatchObject({
      code: 'INVALID_SETTING',
    });
    await updateSetting(ctx.deps, admin.id, 'go_live.access', 'invite');
    expect(await readGoLiveAccess(ctx.deps)).toBe('invite');

    await expect(
      updateSetting(ctx.deps, admin.id, 'beta.feedback_url', 'javascript:alert(1)'),
    ).rejects.toMatchObject({ code: 'INVALID_SETTING' });
    await updateSetting(ctx.deps, admin.id, 'beta.feedback_url', 'https://t.me/apecam_beta');
    await updateSetting(ctx.deps, admin.id, 'beta.feedback_url', ''); // hide again
  });
});

describe('S5-2 · report SLA alert', () => {
  it('T-S5-I3 · a report open for more than 15 minutes alerts once per stream', async () => {
    const s = await goLive();
    const viewer = (await ctx.createUser()).user;
    await createReport(ctx.deps, { userId: viewer.id, streamId: s.streamId, category: 'scam' });
    ctx.notifier.sent.length = 0;

    expect((await monitorSystem(ctx.deps)).staleReports).toBe(0);
    ctx.advance(REPORT_SLA_MS + 60_000);
    expect((await monitorSystem(ctx.deps)).staleReports).toBe(1);
    await monitorSystem(ctx.deps);
    expect(ctx.notifier.sent.filter((t) => t.includes('Report open'))).toHaveLength(1);
    expect(ctx.notifier.sent.find((t) => t.includes('Report open'))).toContain('beta stream');
  });

  it('handled reports never alert', async () => {
    const s = await goLive();
    const { user: mod } = await ctx.createUser({ role: 'moderator' });
    const viewer = (await ctx.createUser()).user;
    await createReport(ctx.deps, { userId: viewer.id, streamId: s.streamId, category: 'scam' });
    await killStream(ctx.deps, mod.id, s.streamId, 'scam');
    ctx.advance(REPORT_SLA_MS + 60_000);
    expect((await monitorSystem(ctx.deps)).staleReports).toBe(0);
  });
});

describe('S5-3 · daily ops report', () => {
  it('T-S5-I4 · summarises the previous UTC day and is sent to the alert channel', async () => {
    const s = await goLive();
    const { user: mod } = await ctx.createUser({ role: 'moderator' });
    const viewer = (await ctx.createUser()).user;
    await createReport(ctx.deps, { userId: viewer.id, streamId: s.streamId, category: 'scam' });
    ctx.advance(4 * 60_000);
    await killStream(ctx.deps, mod.id, s.streamId, 'scam'); // handled after 4 minutes
    await goLive();

    ctx.advance(24 * 3600_000); // next day
    const report = await dailyOpsReport(ctx.deps);
    expect(report).toMatchObject({
      day: '2026-10-01',
      streams: 2,
      streamers: 2,
      reportsOpened: 1,
      reportsHandled: 1,
      medianMinutesToAction: 4,
      streamsWithOpenReports: 0,
      tracker: 'LAGGING', // configured in tests, never synced
    });
    expect(ctx.notifier.sent.at(-1)).toMatch(/^📊 APECAM 2026-10-01 \(UTC\)/);
  });
});
