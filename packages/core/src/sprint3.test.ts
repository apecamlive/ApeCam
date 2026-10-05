import {
  burns,
  buybacks,
  payoutBatches,
  reports,
  rewards,
  streamMinutes,
  streams,
  syncCursors,
  users,
  wallets,
} from '@apecam/db';
import { DEAD_ADDRESS, type TransferLog } from '@apecam/tracker';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeFrame, frameCheck } from './frames';
import { recheckHoldings } from './holdings';
import {
  batchCsv,
  createPayoutBatch,
  previousWeek,
  syncPayouts,
  unmatchedTransfers,
  matchTransfer,
  voidReward,
} from './payouts';
import { setPayoutWallet } from './profile';
import { closeRecentRewards, closeRewards, countMinutes, myRewards, todayProgress } from './stream-to-earn';
import { startStream } from './streams';
import { getStreamStatus } from './studio';
import { APECAM_TEST, createTestContext, quote, TEST_EVM_TOKEN } from './testing';
import { syncTracker, trackerDaily, trackerSummary } from './tracker-sync';
import { handleLivekitEvent } from './webhooks';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => ctx.close());

const E18 = 10n ** 18n;
const MIN = 60_000;

async function jpeg(color: string, noise = false) {
  if (!noise)
    return new Uint8Array(
      await sharp({ create: { width: 320, height: 180, channels: 3, background: color } })
        .jpeg()
        .toBuffer(),
    );
  const px = Buffer.alloc(320 * 180 * 3);
  for (let i = 0; i < px.length; i++) px[i] = Math.floor(Math.random() * 256);
  return new Uint8Array(
    await sharp(px, { raw: { width: 320, height: 180, channels: 3 } })
      .jpeg()
      .toBuffer(),
  );
}

/** A live stream with a fresh holding check and a valid frame, plus `viewers` old-enough signed-in viewers. */
async function liveWithAudience(viewers = 3) {
  const {
    user,
    wallets: [w],
  } = await ctx.createUser();
  ctx.fund(w!.address, 150);
  const s = await startStream(ctx.deps, {
    userId: user.id,
    walletId: w!.id,
    chain: 'base',
    contract: TEST_EVM_TOKEN,
    title: 'gm apes',
    source: 'camera',
    rulesAccepted: true,
    ageConfirmed: true,
  });
  await handleLivekitEvent(ctx.deps, {
    event: 'track_published',
    room: { name: s.room },
    participant: { identity: `pub_${user.id}` },
  });
  ctx.streaming.join(s.room, `pub_${user.id}`);
  const audience = [];
  for (let i = 0; i < viewers; i++) {
    const v = (await ctx.createUser()).user;
    await ctx.db
      .update(users)
      .set({ createdAt: new Date(ctx.deps.now!().getTime() - 48 * 3600_000) })
      .where(eq(users.id, v.id));
    ctx.streaming.join(s.room, `u_${v.id}`);
    audience.push(v);
  }
  await ctx.db.update(streams).set({ lastFrameOkAt: ctx.deps.now!() }).where(eq(streams.id, s.streamId));
  return { user, wallet: w!, ...s, audience };
}

/** Advance one minute, keep the frame fresh, run the minute counter. */
async function tick(streamIds: string[], n = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    ctx.advance(MIN);
    for (const id of streamIds)
      await ctx.db.update(streams).set({ lastFrameOkAt: ctx.deps.now!() }).where(eq(streams.id, id));
    // Keep the holding check fresh the way the worker does.
    await recheckHoldings(ctx.deps);
    out.push(await countMinutes(ctx.deps));
  }
  return out;
}

describe('S3-2 · valid minutes', () => {
  it('a minute counts when every condition holds', async () => {
    const s = await liveWithAudience(3);
    const r = (await tick([s.streamId]))[0]![0];
    expect(r).toMatchObject({ streamId: s.streamId, valid: true, viewers: 3, failures: [] });
  });

  it('T-S3-I1 · each failing condition makes the minute invalid, with the matching flag', async () => {
    const s = await liveWithAudience(3);
    // viewers: one leaves
    ctx.streaming.leave(s.room, `u_${s.audience[0]!.id}`);
    expect((await tick([s.streamId]))[0]![0]!.failures).toEqual(['viewers']);
    ctx.streaming.join(s.room, `u_${s.audience[0]!.id}`);
    // video: frame older than 2 minutes
    ctx.advance(MIN);
    await ctx.db
      .update(streams)
      .set({ lastFrameOkAt: new Date(ctx.deps.now!().getTime() - 3 * MIN) })
      .where(eq(streams.id, s.streamId));
    expect((await countMinutes(ctx.deps))[0]!.failures).toEqual(['video']);
    // open report
    await ctx.db
      .insert(reports)
      .values({ streamId: s.streamId, reporterUserId: s.audience[1]!.id, category: 'spam' });
    expect((await tick([s.streamId]))[0]![0]!.failures).toEqual(['report']);
    await ctx.db.update(reports).set({ status: 'dismissed' });
    // blurred
    await ctx.db.update(streams).set({ blurred: true }).where(eq(streams.id, s.streamId));
    expect((await tick([s.streamId]))[0]![0]!.failures).toEqual(['blurred']);
    await ctx.db.update(streams).set({ blurred: false }).where(eq(streams.id, s.streamId));
    // holding: no check for more than 6 minutes
    ctx.evm.failing = true; // re-check can't refresh it
    ctx.advance(7 * MIN);
    await ctx.db.update(streams).set({ lastFrameOkAt: ctx.deps.now!() }).where(eq(streams.id, s.streamId));
    expect((await countMinutes(ctx.deps))[0]!.failures).toEqual(['holding']);
    const rows = await ctx.db.select().from(streamMinutes).where(eq(streamMinutes.streamId, s.streamId));
    expect(rows.filter((r) => r.valid)).toHaveLength(0);
  });

  it("T-S3-I2 · the streamer's own viewer tab never counts", async () => {
    const s = await liveWithAudience(2);
    ctx.streaming.join(s.room, `u_${s.user.id}`);
    expect((await tick([s.streamId]))[0]![0]).toMatchObject({
      viewers: 2,
      valid: false,
      failures: ['viewers'],
    });
  });

  it('T-S3-I3 · viewers whose account is younger than 24h do not count', async () => {
    const s = await liveWithAudience(2);
    const fresh = (await ctx.createUser()).user;
    // Signed up one hour ago on the test clock.
    await ctx.db
      .update(users)
      .set({ createdAt: new Date(ctx.deps.now!().getTime() - 3600_000) })
      .where(eq(users.id, fresh.id));
    ctx.streaming.join(s.room, `u_${fresh.id}`);
    expect((await tick([s.streamId]))[0]![0]!.viewers).toBe(2);
  });

  it('T-S3-I4 · one viewer watching two streams is credited to one of them only', async () => {
    const a = await liveWithAudience(3);
    ctx.advance(1000); // a went live first, so it is credited first
    const b = await liveWithAudience(2);
    ctx.streaming.join(b.room, `u_${a.audience[0]!.id}`); // a's viewer also opens b
    const [results] = await tick([a.streamId, b.streamId]);
    const byId = new Map(results!.map((r) => [r.streamId, r]));
    expect(byId.get(a.streamId)).toMatchObject({ valid: true, viewers: 3 });
    expect(byId.get(b.streamId)).toMatchObject({ valid: false, viewers: 2 });
  });

  it('a minute is recorded once even if the counter runs twice in the same minute', async () => {
    const s = await liveWithAudience(3);
    await tick([s.streamId]);
    await countMinutes(ctx.deps);
    expect(
      await ctx.db.select().from(streamMinutes).where(eq(streamMinutes.streamId, s.streamId)),
    ).toHaveLength(1);
  });
});

describe('S3-3 · daily rewards', () => {
  it('12 valid minutes → 1,000 $APECAM pending the next day; Studio shows progress', async () => {
    const s = await liveWithAudience(3);
    await tick([s.streamId], 12);
    const p = await todayProgress(ctx.deps, s.user.id);
    expect(p).toMatchObject({ validMinutesToday: 12, nextTier: { minutes: 30, total: 2000 } });
    expect(BigInt(p.earnedTodayRaw)).toBe(1000n * E18);
    const st = await getStreamStatus(ctx.deps, { userId: s.user.id, streamId: s.streamId });
    expect(st.earn.lastMinute).toMatchObject({ valid: true, failures: [] });

    ctx.advance(24 * 3600_000);
    const res = await closeRewards(ctx.deps);
    expect(res).toMatchObject({ period: '2026-10-01', rewards: 1 });
    const mine = await myRewards(ctx.deps, s.user.id);
    expect(mine.totals.pendingRaw).toBe((1000n * E18).toString());
    expect(mine.rewards[0]).toMatchObject({ validMinutes: 12, status: 'pending' });
  });

  it('T-S3-I5 · closing the same day twice gives the same single reward', async () => {
    const s = await liveWithAudience(3);
    await tick([s.streamId], 10);
    ctx.advance(24 * 3600_000);
    await closeRewards(ctx.deps);
    await closeRewards(ctx.deps);
    expect(await ctx.db.select().from(rewards).where(eq(rewards.userId, s.user.id))).toHaveLength(1);
  });

  it('D15 · two parallel streams of one user in the same minutes count once', async () => {
    const { user, wallets: ws } = await ctx.createUser({ wallets: 2 });
    const ids = [];
    const audience = [];
    for (let i = 0; i < 6; i++) {
      const v = (await ctx.createUser()).user;
      await ctx.db
        .update(users)
        .set({ createdAt: new Date(0) })
        .where(eq(users.id, v.id));
      audience.push(v);
    }
    for (const [i, w] of ws.entries()) {
      ctx.fund(w.address, 150);
      const s = await startStream(ctx.deps, {
        userId: user.id,
        walletId: w.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
        title: 'gm apes',
        source: 'camera',
        rulesAccepted: true,
        ageConfirmed: true,
      });
      await handleLivekitEvent(ctx.deps, {
        event: 'track_published',
        room: { name: s.room },
        participant: { identity: `pub_${user.id}` },
      });
      for (const v of audience.slice(i * 3, i * 3 + 3)) ctx.streaming.join(s.room, `u_${v.id}`);
      ids.push(s.streamId);
    }
    await tick(ids, 30);
    expect((await todayProgress(ctx.deps, user.id)).validMinutesToday).toBe(30); // not 60
  });

  it('a day missed while the worker was down is closed by the next nightly run', async () => {
    const s = await liveWithAudience(3);
    await tick([s.streamId], 10); // 2026-10-01
    ctx.advance(2 * 24 * 3600_000); // the 10-02 run never happened; now it is 10-03
    const res = await closeRecentRewards(ctx.deps);
    expect(res.map((r) => r.period)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
    const rows = await ctx.db.select().from(rewards).where(eq(rewards.userId, s.user.id));
    expect(rows).toMatchObject([{ period: '2026-10-01', validMinutes: 10, status: 'pending' }]);
  });

  it('a paid reward is never rewritten by a re-run', async () => {
    const s = await liveWithAudience(3);
    await tick([s.streamId], 10);
    ctx.advance(24 * 3600_000);
    await closeRewards(ctx.deps);
    await ctx.db.update(rewards).set({ status: 'paid', apecamAmount: '1' });
    await closeRewards(ctx.deps);
    expect((await ctx.db.select().from(rewards))[0]).toMatchObject({ status: 'paid', apecamAmount: '1' });
  });
});

describe('S3-4 / S3-6 · weekly payouts', () => {
  async function pendingReward(amountWhole: number, period = '2026-10-01', withPayout = true) {
    const {
      user,
      wallets: [w],
    } = await ctx.createUser();
    if (withPayout) await setPayoutWallet(ctx.deps, { userId: user.id, walletId: w!.id });
    const [r] = await ctx.db
      .insert(rewards)
      .values({
        userId: user.id,
        period,
        validMinutes: 100,
        apecamAmount: (BigInt(amountWhole) * E18).toString(),
        status: 'pending',
      })
      .returning();
    return { user, wallet: w!, reward: r! };
  }
  // Oct 1 2026 is a Thursday; the Monday after that week is Oct 5.
  const monday = () => ctx.advance(Date.UTC(2026, 9, 5, 9) - ctx.deps.now!().getTime());

  it('previous week is Monday–Sunday UTC', () => {
    expect(previousWeek(new Date('2026-10-05T09:00:00Z'))).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(previousWeek(new Date('2026-10-11T23:59:00Z'))).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it('T-S3-I6 · batch takes last week and older pending rewards with a payout wallet; others stay pending', async () => {
    const a = await pendingReward(5000, '2026-10-01');
    const noWallet = await pendingReward(1000, '2026-10-02', false);
    const nextWeek = await pendingReward(2000, '2026-10-06');
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.treasury, 1_000_000n * E18);
    monday();
    const res = await createPayoutBatch(ctx.deps, (await ctx.createUser({ role: 'admin' })).user.id);
    expect(res).toMatchObject({
      rewards: 1,
      withoutPayoutWallet: 1,
      factor: 1,
      period: { from: '2026-09-28', to: '2026-10-04' },
    });
    const status = async (id: string) =>
      (await ctx.db.select().from(rewards).where(eq(rewards.id, id)))[0]!.status;
    expect(await status(a.reward.id)).toBe('batched');
    expect(await status(noWallet.reward.id)).toBe('pending');
    expect(await status(nextWeek.reward.id)).toBe('pending');
    expect(await batchCsv(ctx.deps, res.batchId)).toBe(
      `wallet,amount_raw,amount\n${a.wallet.address},${5000n * E18},5000`,
    );
    await expect(createPayoutBatch(ctx.deps, a.user.id)).rejects.toMatchObject({ code: 'BATCH_EXISTS' });
  });

  it('D6 · batch above 50% of the treasury is scaled pro-rata', async () => {
    const r = await pendingReward(5000);
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.treasury, 8000n * E18); // 50% = 4,000
    monday();
    const res = await createPayoutBatch(ctx.deps, r.user.id);
    expect(res.factor).toBe(0.8);
    const [row] = await ctx.db.select().from(rewards).where(eq(rewards.id, r.reward.id));
    expect(row).toMatchObject({ apecamAmount: (4000n * E18).toString(), scaleFactor: '0.8' });
  });

  it('T-S3-I7 · a voided reward is not batched', async () => {
    const r = await pendingReward(5000);
    await voidReward(ctx.deps, r.user.id, r.reward.id, 'viewer ring');
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.treasury, 10n ** 9n * E18);
    monday();
    await expect(createPayoutBatch(ctx.deps, r.user.id)).rejects.toMatchObject({ code: 'NOTHING_TO_PAY' });
  });

  it("T-S3-I10 · a treasury transfer matching a wallet's batch total marks its rewards paid", async () => {
    const a = await pendingReward(5000, '2026-09-30');
    await ctx.db.insert(rewards).values({
      userId: a.user.id,
      period: '2026-10-01',
      validMinutes: 10,
      apecamAmount: (1000n * E18).toString(),
      status: 'pending',
    });
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.treasury, 10n ** 9n * E18);
    monday();
    const batch = await createPayoutBatch(ctx.deps, a.user.id);
    // Owner sends one transfer of the summed 6,000 to the wallet.
    ctx.apecamSource.head = 50;
    ctx.apecamSource.logs = [
      {
        txHash: '0xpay',
        logIndex: 0,
        blockNumber: 20,
        from: APECAM_TEST.wallets.treasury,
        to: a.wallet.address,
        value: 6000n * E18,
      },
    ];
    await syncTracker(ctx.deps);
    expect(await syncPayouts(ctx.deps)).toMatchObject({ matched: 1, unmatched: 0 });
    const mine = await myRewards(ctx.deps, a.user.id);
    expect(mine.rewards.every((r) => r.status === 'paid' && r.payoutTxHash === '0xpay')).toBe(true);
    expect(
      (await ctx.db.select().from(payoutBatches).where(eq(payoutBatches.id, batch.batchId)))[0]!.status,
    ).toBe('paid');
  });

  it('T-S3-I11 · an ambiguous or wrong-amount transfer is left for manual reconciliation', async () => {
    const a = await pendingReward(5000);
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.treasury, 10n ** 9n * E18);
    monday();
    const batch = await createPayoutBatch(ctx.deps, a.user.id);
    ctx.apecamSource.head = 50;
    ctx.apecamSource.logs = [
      {
        txHash: '0xodd',
        logIndex: 2,
        blockNumber: 30,
        from: APECAM_TEST.wallets.treasury,
        to: a.wallet.address,
        value: 4999n * E18,
      },
    ];
    await syncTracker(ctx.deps);
    expect(await syncPayouts(ctx.deps)).toMatchObject({ matched: 0, unmatched: 1 });
    expect(await unmatchedTransfers(ctx.deps)).toHaveLength(1);
    // Moderator/admin pairs it by hand.
    expect(
      await matchTransfer(ctx.deps, a.user.id, { txHash: '0xodd', logIndex: 2, batchId: batch.batchId }),
    ).toEqual({ matchedRewards: 1 });
    expect(await unmatchedTransfers(ctx.deps)).toHaveLength(0);
  });
});

describe('S3-5 / S3-6 / S3-7 · tracker', () => {
  const W = APECAM_TEST.wallets;
  const pool = '0x9999000000000000000000000000000000000001';
  const t = (block: number, from: string, to: string, whole: bigint, tx = `0x${block}`): TransferLog => ({
    txHash: tx,
    logIndex: 0,
    blockNumber: block,
    from,
    to,
    value: whole * E18,
  });

  beforeEach(() => {
    ctx.prices.quotes.set(APECAM_TEST.contract, quote('0.002'));
    ctx.apecamSource.logs = [
      t(10, pool, W.buyback, 1_000_000n), // buyback (ETH out below)
      t(11, W.buyback, DEAD_ADDRESS, 1_000_000n), // burn
      t(500, pool, W.buyback, 500_000n), // second buyback
      t(501, W.buyback, DEAD_ADDRESS, 500_000n),
      t(600, pool, '0x1234000000000000000000000000000000000001', 5n), // ordinary trade
    ];
    ctx.apecamSource.outflowList = [
      { txHash: '0x10', asset: 'ETH', raw: 2n * E18, decimals: 18 },
      { txHash: '0x500', asset: 'ETH', raw: E18, decimals: 18 },
    ];
    ctx.apecamSource.head = 1000;
    ctx.apecamSource.balances.set(W.burn, 1_500_000n * E18);
    ctx.apecamSource.balances.set(W.treasury, 2_000_000n * E18);
  });

  it('backfill from the deploy block indexes buybacks and burns with USD at indexing time', async () => {
    const res = await syncTracker(ctx.deps);
    expect(res).toMatchObject({ buybacks: 2, burns: 2, toBlock: 1000 });
    const [b] = await ctx.db.select().from(buybacks).where(eq(buybacks.txHash, '0x10'));
    expect(b).toMatchObject({
      apecamAmount: (1_000_000n * E18).toString(),
      spentAsset: 'ETH',
      spentAmount: (2n * E18).toString(),
      usdValue: '2000.00',
    });
  });

  it('T-S3-I8 · stopping and resuming continues from the cursor without duplicates', async () => {
    ctx.apecamSource.head = 300;
    await syncTracker(ctx.deps);
    ctx.apecamSource.head = 1000;
    await syncTracker(ctx.deps);
    await syncTracker(ctx.deps);
    expect(await ctx.db.select().from(buybacks)).toHaveLength(2);
    expect(await ctx.db.select().from(burns)).toHaveLength(2);
    expect((await ctx.db.select().from(syncCursors))[0]!.lastBlock).toBe(1000);
  });

  it('T-S3-I9 · nothing past the safe block is indexed', async () => {
    ctx.apecamSource.head = 400;
    await syncTracker(ctx.deps);
    expect((await ctx.db.select().from(buybacks)).map((b) => b.txHash)).toEqual(['0x10']);
  });

  it('a window with too many logs is halved and retried', async () => {
    ctx.apecamSource.head = 100_000;
    ctx.apecamSource.maxWindow = 5_000;
    await syncTracker(ctx.deps);
    expect(await ctx.db.select().from(burns)).toHaveLength(2);
    const sizes = ctx.apecamSource.windowsRequested.map(([f, to]) => to - f + 1);
    expect(sizes[0]).toBe(100_000); // first try: the whole range
    expect(sizes.some((s) => s <= 5_000)).toBe(true); // halved until it fits
  });

  it('summary: totals, % of supply burned, circulating, 5 wallets, and the chain cross-check', async () => {
    await syncTracker(ctx.deps);
    const s = await trackerSummary(ctx.deps);
    expect(s).toMatchObject({
      boughtBackRaw: (1_500_000n * E18).toString(),
      burnedRaw: (1_500_000n * E18).toString(),
      burnedPercent: 0.15,
      circulatingRaw: (998_500_000n * E18).toString(),
      treasuryRaw: (2_000_000n * E18).toString(),
      burnIndexMatchesChain: true,
    });
    expect(s.wallets.map((w) => w.role)).toEqual(['creatorFee', 'operations', 'buyback', 'burn', 'treasury']);
  });

  it('T-S3-I12 · a burn total that differs from the chain is flagged', async () => {
    await syncTracker(ctx.deps);
    ctx.apecamSource.balances.set(W.burn, 9_999_999n * E18);
    await ctx.kv.del('tracker:summary');
    expect((await trackerSummary(ctx.deps)).burnIndexMatchesChain).toBe(false);
  });

  it('daily chart groups by UTC day', async () => {
    await syncTracker(ctx.deps);
    const days = await trackerDaily(ctx.deps, 3650);
    expect(days.length).toBeGreaterThan(0);
    expect(days.reduce((s, d) => s + BigInt(d.burnRaw), 0n)).toBe(1_500_000n * E18);
  });

  it('tracker is skipped cleanly until the owner configures addresses', async () => {
    expect(await syncTracker({ ...ctx.deps, apecam: undefined })).toEqual({
      skipped: 'APECAM contract and wallets not configured',
    });
    await expect(trackerSummary({ ...ctx.deps, apecam: undefined })).rejects.toMatchObject({
      code: 'TRACKER_NOT_CONFIGURED',
    });
  });
});

describe('S3-2 · frame analysis', () => {
  it('T-S3-U14 · black frame, frozen frame, moving frame', async () => {
    const black = await analyzeFrame(await jpeg('#000000'));
    expect(black.black).toBe(true);
    const live1 = await analyzeFrame(await jpeg('#000', true));
    expect(live1.black).toBe(false);
    const frozen = await analyzeFrame(
      await jpeg('#000', true).then(() => jpeg('#406080')),
      (await analyzeFrame(await jpeg('#406080'))).signature,
    );
    expect(frozen.unchanged).toBe(true);
    const moving = await analyzeFrame(await jpeg('#000', true), live1.signature);
    expect(moving.unchanged).toBe(false);
  });

  it('frame-check: a black snapshot does not refresh last_frame_ok_at; 10 minutes without video ends the stream', async () => {
    const s = await liveWithAudience(0);
    await ctx.db
      .update(streams)
      .set({ lastFrameOkAt: ctx.deps.now!(), egressId: 'egress_1' })
      .where(eq(streams.id, s.streamId));
    const okAt = ctx.deps.now!();
    ctx.advance(MIN);
    ctx.snapshots.add(s.streamId, 'img_1.jpeg', await jpeg('#000000'));
    expect(await frameCheck(ctx.deps)).toMatchObject({ bad: 1, ended: 0 });
    expect((await ctx.db.select().from(streams).where(eq(streams.id, s.streamId)))[0]!.lastFrameOkAt).toEqual(
      okAt,
    );
    ctx.advance(10 * MIN);
    ctx.snapshots.add(s.streamId, 'img_2.jpeg', await jpeg('#000000'));
    expect(await frameCheck(ctx.deps)).toMatchObject({ ended: 1 });
    expect((await ctx.db.select().from(streams).where(eq(streams.id, s.streamId)))[0]).toMatchObject({
      status: 'ended',
      endReason: 'no_video',
    });
  });

  it('frame-check: three identical snapshots in a row = static video', async () => {
    const s = await liveWithAudience(0);
    const img = await jpeg('#406080');
    const results = [];
    for (let i = 1; i <= 4; i++) {
      ctx.advance(MIN);
      ctx.snapshots.add(s.streamId, `img_${i}.jpeg`, img);
      results.push(await frameCheck(ctx.deps));
    }
    // 1st: no previous frame → ok; 2nd, 3rd: unchanged but under the limit → ok; 4th: third unchanged in a row → bad.
    expect(results.map((r) => ('bad' in r ? r.bad : -1))).toEqual([0, 0, 0, 1]);
  });

  it('a stream without snapshot egress is never ended for missing video', async () => {
    const s = await liveWithAudience(0);
    // e.g. Egress failed to start: no snapshots are expected, so missing video is not the streamer's fault.
    await ctx.db.update(streams).set({ egressId: null }).where(eq(streams.id, s.streamId));
    ctx.advance(30 * MIN);
    await frameCheck(ctx.deps);
    expect((await ctx.db.select().from(streams).where(eq(streams.id, s.streamId)))[0]!.status).toBe('live');
  });
});

void wallets;
