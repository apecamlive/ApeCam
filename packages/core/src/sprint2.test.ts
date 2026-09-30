import { modActions, reports, streams, tokens, users, wallets } from '@apecam/db';
import { kvKeys } from '@apecam/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  banWallet,
  deleteChatMessage,
  dismissReports,
  killStream,
  listOpenReports,
  setTokenHidden,
  unbanWallet,
} from './admin';
import { sendChatMessage, recentChat } from './chat';
import { checkEligibility } from './eligibility';
import { getFeed } from './feed';
import { createReport } from './moderation';
import {
  getPublicProfile,
  linkWallet,
  registerEmbeddedWallet,
  setPayoutWallet,
  updateDisplayName,
  validateDisplayName,
} from './profile';
import { searchTokens } from './search';
import { startStream } from './streams';
import { getStreamStatus, liveStreamsByWallet } from './studio';
import { createTestContext, quote, TEST_EVM_TOKEN } from './testing';
import { listWalletTokens } from './wallet-tokens';
import { handleLivekitEvent } from './webhooks';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => ctx.close());

async function goLive(opts: { contract?: string; wallets?: number } = {}) {
  const contract = opts.contract ?? TEST_EVM_TOKEN;
  const { user, wallets: ws } = await ctx.createUser({ wallets: opts.wallets });
  const started = [];
  for (const w of ws) {
    ctx.fund(w.address, 150, contract);
    const s = await startStream(ctx.deps, {
      userId: user.id,
      walletId: w.id,
      chain: 'base',
      contract,
      title: 'gm',
      source: 'camera',
      rulesAccepted: true,
      ageConfirmed: true,
    });
    await handleLivekitEvent(ctx.deps, {
      event: 'track_published',
      room: { name: s.room },
      participant: { identity: `pub_${user.id}` },
    });
    started.push({ ...s, wallet: w });
  }
  return { user, wallet: ws[0]!, streamId: started[0]!.streamId, room: started[0]!.room, started };
}

const stream = async (id: string) => (await ctx.db.select().from(streams).where(eq(streams.id, id)))[0]!;
const viewer = async () => (await ctx.createUser()).user;
const mod = async () => (await ctx.createUser({ role: 'moderator' })).user;

describe('S2-1 · wallet tokens', () => {
  it('T-S2-U2 · most valuable first, unpriced last, hidden tokens left out', async () => {
    const {
      user,
      wallets: [w],
    } = await ctx.createUser();
    const a = '0x00000000000000000000000000000000000000a1';
    const b = '0x00000000000000000000000000000000000000b2';
    const c = '0x00000000000000000000000000000000000000c3';
    const hidden = '0x00000000000000000000000000000000000000d4';
    ctx.evm.balances.set(`${w!.address}:${a}`, 10n * 10n ** 18n);
    ctx.evm.balances.set(`${w!.address}:${b}`, 10n * 10n ** 18n);
    ctx.evm.balances.set(`${w!.address}:${c}`, 10n * 10n ** 18n);
    ctx.evm.balances.set(`${w!.address}:${hidden}`, 10n * 10n ** 18n);
    ctx.prices.quotes.set(a, quote('1'));
    ctx.prices.quotes.set(b, quote('5'));
    ctx.prices.quotes.set(hidden, quote('100'));
    await ctx.db.insert(tokens).values({ chain: 'base', contract: hidden, hidden: true });

    const res = await listWalletTokens(ctx.deps, { userId: user.id, walletId: w!.id });
    const baseTokens = res.tokens.filter((t) => t.chain === 'base');
    expect(baseTokens.map((t) => [t.contract, t.usdValue])).toEqual([
      [b, '50.00'],
      [a, '10.00'],
      [c, null],
    ]);
  });

  it('chains without a token API are reported so the Studio offers paste-CA', async () => {
    const {
      user,
      wallets: [w],
    } = await ctx.createUser();
    ctx.evm.listingSupported = false;
    const res = await listWalletTokens(ctx.deps, { userId: user.id, walletId: w!.id });
    expect(res.unsupported).toEqual(expect.arrayContaining(['robinhood', 'base', 'bsc']));
  });

  it("another user's wallet → 404", async () => {
    const {
      wallets: [w],
    } = await ctx.createUser();
    const other = await viewer();
    await expect(listWalletTokens(ctx.deps, { userId: other.id, walletId: w!.id })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('S2-2 · studio status', () => {
  it('shows viewers, last check and warning; only for the streamer', async () => {
    const { user, streamId } = await goLive();
    const st = await getStreamStatus(ctx.deps, { userId: user.id, streamId });
    expect(st).toMatchObject({
      status: 'live',
      lastCheck: { passed: true, usdValue: '150.00' },
      warningUntil: null,
    });
    await expect(getStreamStatus(ctx.deps, { userId: (await viewer()).id, streamId })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('D15 · live wallets are reported so the picker can disable them', async () => {
    const { user, started } = await goLive({ wallets: 2 });
    const map = await liveStreamsByWallet(ctx.deps, user.id);
    expect(map.size).toBe(2);
    expect(map.get(started[1]!.wallet.id)).toBe(started[1]!.streamId);
  });
});

describe('S2-3 · reports and auto-blur', () => {
  it('T-S2-U1 · 2 reporters → no blur; 3 within 5 min → blur + alert', async () => {
    const { streamId, room } = await goLive();
    await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'spam' });
    const second = await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'spam' });
    expect(second.blurred).toBe(false);
    const third = await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'scam' });
    expect(third.blurred).toBe(true);
    expect((await stream(streamId)).blurred).toBe(true);
    expect(ctx.streaming.sent).toContainEqual(
      expect.objectContaining({ room, topic: 'system', payload: { type: 'blur', on: true } }),
    );
    expect(ctx.notifier.sent.at(-1)).toMatch(/Auto-blurred after 3 reports/);
  });

  it('T-S2-U1 · 3 reporters spread over more than 5 minutes → no blur', async () => {
    const { streamId } = await goLive();
    for (let i = 0; i < 3; i++) {
      await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'spam' });
      ctx.advance(3 * 60_000);
    }
    expect((await stream(streamId)).blurred).toBe(false);
  });

  it('T-S2-I1 / I2 · the same user cannot report a stream twice (so one person cannot trigger a blur)', async () => {
    const { streamId } = await goLive();
    const v = await viewer();
    await createReport(ctx.deps, { userId: v.id, streamId, category: 'spam' });
    await expect(createReport(ctx.deps, { userId: v.id, streamId, category: 'hate' })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_REPORTED',
    });
    expect(await ctx.db.select().from(reports).where(eq(reports.streamId, streamId))).toHaveLength(1);
  });

  it('a severe category pages moderators on the first report', async () => {
    const { streamId } = await goLive();
    await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'self_harm' });
    expect(ctx.notifier.sent[0]).toMatch(/self_harm report/);
  });

  it('streamers cannot report themselves', async () => {
    const { user, streamId } = await goLive();
    await expect(
      createReport(ctx.deps, { userId: user.id, streamId, category: 'spam' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('S2-4 · admin actions', () => {
  it('T-S2-I4 · kill → killed, room deleted, reports closed, action logged', async () => {
    const { streamId, room } = await goLive();
    await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'violence' });
    const m = await mod();
    await killStream(ctx.deps, m.id, streamId, 'violent content');
    expect(await stream(streamId)).toMatchObject({ status: 'killed', endReason: 'admin_kill' });
    expect(ctx.streaming.deleted).toContain(room);
    expect(await listOpenReports(ctx.deps)).toEqual([]);
    const [action] = await ctx.db.select().from(modActions);
    expect(action).toMatchObject({
      actorUserId: m.id,
      action: 'kill_stream',
      targetId: streamId,
      reason: 'violent content',
    });
  });

  it('open reports are grouped per stream with reporter count', async () => {
    const { streamId } = await goLive();
    await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'spam' });
    await createReport(ctx.deps, {
      userId: (await viewer()).id,
      streamId,
      category: 'scam',
      reason: 'fake giveaway',
    });
    const [entry] = await listOpenReports(ctx.deps);
    expect(entry).toMatchObject({
      streamId,
      reporters: 2,
      categories: expect.arrayContaining(['spam', 'scam']),
      reasons: ['fake giveaway'],
    });
  });

  it('dismissing reports lifts the auto-blur', async () => {
    const { streamId } = await goLive();
    for (let i = 0; i < 3; i++)
      await createReport(ctx.deps, { userId: (await viewer()).id, streamId, category: 'spam' });
    await dismissReports(ctx.deps, (await mod()).id, streamId, 'false alarm');
    expect((await stream(streamId)).blurred).toBe(false);
    expect(await listOpenReports(ctx.deps)).toEqual([]);
  });

  it('T-S2-I5 · banning a user live on 2 wallets ends both streams and invalidates sessions', async () => {
    const { user, started } = await goLive({ wallets: 2 });
    const res = await banWallet(ctx.deps, (await mod()).id, started[1]!.wallet.address, 'permanent', 'scam');
    expect(res.streamsEnded).toBe(2);
    for (const s of started) expect((await stream(s.streamId)).status).toBe('killed');
    const [u] = await ctx.db.select().from(users).where(eq(users.id, user.id));
    expect(u!.bannedUntil!.getUTCFullYear()).toBe(9999);
    expect(await ctx.kv.get(kvKeys.sessionsValidAfter(user.id))).toBe(String(ctx.deps.now!().getTime()));
  });

  it('T-S2-I6 · a temporary ban expires; unban clears it', async () => {
    const { user, wallet } = await goLive();
    await banWallet(
      ctx.deps,
      (await mod()).id,
      wallet.address,
      new Date(ctx.deps.now!().getTime() + 3600_000),
      'spam',
    );
    ctx.fund(wallet.address, 150);
    const check = () =>
      checkEligibility(ctx.deps, {
        userId: user.id,
        walletId: wallet.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
      });
    expect((await check()).result.reasons).toContain('USER_BANNED');
    ctx.advance(3600_001);
    expect((await check()).result.reasons).not.toContain('USER_BANNED');
    await unbanWallet(ctx.deps, (await mod()).id, wallet.address);
  });

  it('staff cannot be banned from the moderation panel', async () => {
    const m = await ctx.createUser({ role: 'moderator' });
    await expect(
      banWallet(ctx.deps, (await mod()).id, m.wallets[0]!.address, 'permanent', 'x'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('T-S2-I7 · hidden token: not eligible, gone from feed, search and holdings, live streams ended', async () => {
    const { user, wallet, streamId } = await goLive();
    await setTokenHidden(ctx.deps, (await mod()).id, 'base', TEST_EVM_TOKEN, true, 'scam token');
    expect((await stream(streamId)).status).toBe('killed');
    const elig = await checkEligibility(ctx.deps, {
      userId: user.id,
      walletId: wallet.id,
      chain: 'base',
      contract: TEST_EVM_TOKEN,
    });
    expect(elig.result.reasons).toContain('TOKEN_HIDDEN');
    expect((await getFeed(ctx.deps, 'live')).items).toEqual([]);
    expect(
      await searchTokens(
        { ...ctx.deps, findPairsByAddress: async () => [{ chainSlug: 'base' }] },
        TEST_EVM_TOKEN,
      ),
    ).toEqual([]);
    await ctx.kv.del(`holdings:${wallet.id}`);
    // The test adapter serves every EVM chain; hiding is per chain + contract, so check base only.
    const holdings = await listWalletTokens(ctx.deps, { userId: user.id, walletId: wallet.id });
    expect(holdings.tokens.filter((t) => t.chain === 'base')).toEqual([]);
  });

  it('T-S2-I13 · moderator deletes a chat message: hidden from history, broadcast to the room', async () => {
    const { streamId, room } = await goLive();
    const v = await viewer();
    const msg = await sendChatMessage(ctx.deps, { userId: v.id, streamId, body: 'buy my scam' });
    await deleteChatMessage(ctx.deps, (await mod()).id, msg.id, 'spam');
    expect(await recentChat(ctx.deps, streamId)).toEqual([]);
    expect(ctx.streaming.sent).toContainEqual(
      expect.objectContaining({ room, topic: 'chat', payload: { type: 'chat_delete', id: msg.id } }),
    );
    await expect(deleteChatMessage(ctx.deps, (await mod()).id, msg.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('S2-6 / S2-9 · wallets and profile', () => {
  const SOL = '9uNmRWtgQ8oZ4yA7zRk8b7T5mR9dQh1wM3uF2cV6nK4p';

  it('links a second wallet; linking again is idempotent', async () => {
    const { user } = await ctx.createUser();
    const a = await linkWallet(ctx.deps, { userId: user.id, family: 'solana', address: SOL });
    const b = await linkWallet(ctx.deps, { userId: user.id, family: 'solana', address: SOL });
    expect(b.id).toBe(a.id);
  });

  it('T-S2-I8 · a wallet owned by another user → 409 WALLET_TAKEN', async () => {
    const {
      wallets: [w],
    } = await ctx.createUser();
    const other = await viewer();
    await expect(
      linkWallet(ctx.deps, {
        userId: other.id,
        family: 'evm',
        address: w!.address.toUpperCase().replace('0X', '0x'),
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'WALLET_TAKEN',
    });
  });

  it('T-S2-I9 · payout wallet must be EVM; only one payout wallet at a time', async () => {
    const {
      user,
      wallets: [evmA, evmB],
    } = await ctx.createUser({ wallets: 2 });
    const sol = await linkWallet(ctx.deps, { userId: user.id, family: 'solana', address: SOL });
    await expect(setPayoutWallet(ctx.deps, { userId: user.id, walletId: sol.id })).rejects.toMatchObject({
      code: 'PAYOUT_MUST_BE_EVM',
    });
    await setPayoutWallet(ctx.deps, { userId: user.id, walletId: evmA!.id });
    await setPayoutWallet(ctx.deps, { userId: user.id, walletId: evmB!.id });
    const payout = (await ctx.db.select().from(wallets).where(eq(wallets.userId, user.id))).filter(
      (w) => w.isPayout,
    );
    expect(payout.map((w) => w.id)).toEqual([evmB!.id]);
  });

  it('T-S2-I10 · embedded wallet address comes from Privy (server side) and becomes the payout wallet', async () => {
    const { user } = await ctx.createUser({ wallets: 0 });
    const addr = '0x00000000000000000000000000000000000abcde';
    ctx.embeddedWallets.byUser.set(user.id, addr);
    const res = await registerEmbeddedWallet(ctx.deps, user.id);
    expect(res).toMatchObject({ address: addr, isPayout: true });
    const [w] = await ctx.db.select().from(wallets).where(eq(wallets.userId, user.id));
    expect(w).toMatchObject({ source: 'embedded', isPayout: true, address: addr });
  });

  it('T-S2-I11 · registering twice keeps a single embedded wallet', async () => {
    const { user } = await ctx.createUser({ wallets: 0 });
    ctx.embeddedWallets.byUser.set(user.id, '0x00000000000000000000000000000000000abcde');
    await registerEmbeddedWallet(ctx.deps, user.id);
    await registerEmbeddedWallet(ctx.deps, user.id);
    expect(await ctx.db.select().from(wallets).where(eq(wallets.userId, user.id))).toHaveLength(1);
  });

  it('embedded wallet not created yet in Privy → 409', async () => {
    const { user } = await ctx.createUser({ wallets: 0 });
    await expect(registerEmbeddedWallet(ctx.deps, user.id)).rejects.toMatchObject({
      code: 'EMBEDDED_WALLET_MISSING',
    });
  });

  it('an existing payout wallet is kept when the embedded wallet is added', async () => {
    const {
      user,
      wallets: [own],
    } = await ctx.createUser();
    await setPayoutWallet(ctx.deps, { userId: user.id, walletId: own!.id });
    ctx.embeddedWallets.byUser.set(user.id, '0x00000000000000000000000000000000000abcde');
    expect((await registerEmbeddedWallet(ctx.deps, user.id)).isPayout).toBe(false);
  });

  it('display name rules', async () => {
    expect(validateDisplayName('  ape   king ')).toBe('ape king');
    for (const bad of ['a', 'x'.repeat(33), 'hi<script>', 'APECAM official'])
      expect(() => validateDisplayName(bad)).toThrow();
    const { user } = await ctx.createUser();
    expect(await updateDisplayName(ctx.deps, user.id, '')).toEqual({ displayName: null });
  });

  it('public profile resolves any linked wallet to the same user with combined stats', async () => {
    const { user, started } = await goLive({ wallets: 2 });
    const a = await getPublicProfile(ctx.deps, started[0]!.wallet.address);
    const b = await getPublicProfile(ctx.deps, started[1]!.wallet.address.toUpperCase().replace('0X', '0x'));
    expect(a.user.id).toBe(user.id);
    expect(b.user.id).toBe(user.id);
    expect(a.stats).toMatchObject({
      streams: 2,
      tokens: 1,
      validMinutes: 0,
      earnedRaw: '0',
      pendingRaw: '0',
    });
    expect(a.history).toHaveLength(2);
    await expect(getPublicProfile(ctx.deps, '0xnobody')).rejects.toMatchObject({ status: 404 });
  });
});
