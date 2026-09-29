import { TokenNotFoundError } from '@apecam/chain';
import { holdingChecks, streams } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recheckHoldings } from './holdings';
import { endStream, startStream, viewerToken } from './streams';
import { createTestContext, TEST_EVM_TOKEN } from './testing';
import { handleLivekitEvent } from './webhooks';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => ctx.close());

async function liveStream(usd = 150) {
  const { user, wallets } = await ctx.createUser();
  ctx.fund(wallets[0]!.address, usd);
  const started = await startStream(ctx.deps, {
    userId: user.id,
    walletId: wallets[0]!.id,
    chain: 'base',
    contract: TEST_EVM_TOKEN,
    title: 'gm apes',
    source: 'camera',
    rulesAccepted: true,
  });
  await handleLivekitEvent(ctx.deps, {
    event: 'track_published',
    room: { name: started.room },
    participant: { identity: `pub_${user.id}` },
  });
  return { user, wallet: wallets[0]!, ...started };
}

const status = async (id: string) => (await ctx.db.select().from(streams).where(eq(streams.id, id)))[0]!;

describe('startStream', () => {
  it('creates a starting stream, a holding check, a room and a publish token', async () => {
    const { user, wallets } = await ctx.createUser();
    ctx.fund(wallets[0]!.address, 150);
    const res = await startStream(ctx.deps, {
      userId: user.id,
      walletId: wallets[0]!.id,
      chain: 'base',
      contract: TEST_EVM_TOKEN,
      title: 'gm',
      source: 'camera',
      rulesAccepted: true,
    });
    expect(res.token).toBe(`pub-token:${res.room}:pub_${user.id}`);
    expect((await status(res.streamId)).status).toBe('starting');
    expect(ctx.streaming.rooms.has(res.room)).toBe(true);
    expect(
      await ctx.db.select().from(holdingChecks).where(eq(holdingChecks.streamId, res.streamId)),
    ).toHaveLength(1);
  });

  it('rejects when the content rules are not accepted', async () => {
    const { user, wallets } = await ctx.createUser();
    ctx.fund(wallets[0]!.address, 150);
    await expect(
      startStream(ctx.deps, {
        userId: user.id,
        walletId: wallets[0]!.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
        title: 'gm',
        source: 'camera',
        rulesAccepted: false,
      }),
    ).rejects.toMatchObject({ code: 'RULES_NOT_ACCEPTED' });
  });

  it('rejects an under-funded wallet with the eligibility details', async () => {
    const { user, wallets } = await ctx.createUser();
    ctx.fund(wallets[0]!.address, 40);
    await expect(
      startStream(ctx.deps, {
        userId: user.id,
        walletId: wallets[0]!.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
        title: 'gm',
        source: 'camera',
        rulesAccepted: true,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_ELIGIBLE',
      details: { reasons: ['INSUFFICIENT_HOLDING'], shortfallUsd: '60.00' },
    });
  });

  it('T-P0-I6 · the same wallet cannot start twice', async () => {
    const { user, wallet } = await liveStream();
    await expect(
      startStream(ctx.deps, {
        userId: user.id,
        walletId: wallet.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
        title: 'again',
        source: 'camera',
        rulesAccepted: true,
      }),
    ).rejects.toMatchObject({ details: { reasons: ['WALLET_ALREADY_LIVE'] } });
  });

  it('T-P0-I7 · two wallets of the same user can both go live (D15)', async () => {
    const { user, wallets } = await ctx.createUser({ wallets: 2 });
    for (const w of wallets) {
      ctx.fund(w.address, 150);
      await startStream(ctx.deps, {
        userId: user.id,
        walletId: w.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
        title: 'gm',
        source: 'camera',
        rulesAccepted: true,
      });
    }
    expect(await ctx.db.select().from(streams).where(eq(streams.userId, user.id))).toHaveLength(2);
  });

  it('marks the stream ended when LiveKit is down', async () => {
    const { user, wallets } = await ctx.createUser();
    ctx.fund(wallets[0]!.address, 150);
    ctx.streaming.failCreate = true;
    await expect(
      startStream(ctx.deps, {
        userId: user.id,
        walletId: wallets[0]!.id,
        chain: 'base',
        contract: TEST_EVM_TOKEN,
        title: 'gm',
        source: 'camera',
        rulesAccepted: true,
      }),
    ).rejects.toMatchObject({ code: 'STREAMING_UNAVAILABLE' });
    const [s] = await ctx.db.select().from(streams).where(eq(streams.userId, user.id));
    expect(s).toMatchObject({ status: 'ended', endReason: 'error' });
  });
});

describe('endStream / viewerToken', () => {
  it('T-P0-I11 · only the streamer can end the stream', async () => {
    const { streamId } = await liveStream();
    const { user: other } = await ctx.createUser();
    await expect(endStream(ctx.deps, { userId: other.id, streamId })).rejects.toMatchObject({ status: 403 });
  });

  it('ending closes the LiveKit room server-side', async () => {
    const { user, streamId, room } = await liveStream();
    await endStream(ctx.deps, { userId: user.id, streamId });
    expect(await status(streamId)).toMatchObject({ status: 'ended', endReason: 'user_end' });
    expect(ctx.streaming.deleted).toContain(room);
    expect(ctx.streaming.stoppedEgress).toContain(`egress_${room}`);
  });

  it('anonymous viewers get a subscribe token with an a_ identity; ended streams are refused', async () => {
    const { user, streamId } = await liveStream();
    const anon = await viewerToken(ctx.deps, { streamId });
    expect(anon.identity).toMatch(/^a_[0-9a-f]{16}$/);
    await endStream(ctx.deps, { userId: user.id, streamId });
    await expect(viewerToken(ctx.deps, { streamId })).rejects.toMatchObject({ code: 'STREAM_ENDED' });
  });
});

describe('recheckHoldings — Cut the Cam', () => {
  it('skips streams checked less than 5 minutes ago', async () => {
    const { streamId } = await liveStream();
    expect(await recheckHoldings(ctx.deps)).toEqual([{ streamId, outcome: 'skipped' }]);
  });

  it('T-P0-I8 · balance sold → warning → 60s later → cut', async () => {
    const { streamId, wallet, room, user } = await liveStream();
    ctx.fund(wallet.address, 0);
    ctx.advance(5 * 60_000);

    expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('warned');
    expect(ctx.streaming.sent.at(-1)).toMatchObject({
      topic: 'system',
      payload: { type: 'holding_warning' },
      to: [`pub_${user.id}`],
    });

    ctx.advance(30_000);
    expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('still_warning');

    ctx.advance(31_000);
    expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('cut');
    expect(await status(streamId)).toMatchObject({ status: 'cut', endReason: 'holding_failed' });
    expect(ctx.streaming.removed).toContainEqual({ room, identity: `pub_${user.id}` });
    expect(ctx.streaming.deleted).toContain(room);
  });

  it('T-P0-I9 · balance restored within the warning → stream stays live', async () => {
    const { streamId, wallet } = await liveStream();
    ctx.fund(wallet.address, 0);
    ctx.advance(5 * 60_000);
    await recheckHoldings(ctx.deps);

    ctx.fund(wallet.address, 200);
    ctx.advance(20_000);
    expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('passed');
    expect(await status(streamId)).toMatchObject({ status: 'live', warningUntil: null });
    expect(ctx.streaming.sent.at(-1)?.payload).toEqual({ type: 'holding_ok' });
  });

  it('regression · an unexpected error on one stream does not stop the others being checked', async () => {
    const a = await liveStream();
    const b = await liveStream();
    ctx.fund(b.wallet.address, 0);
    ctx.advance(5 * 60_000);
    // Stream A's wallet makes the chain throw something that is not an RPC error.
    const original = ctx.evm.getBalance.bind(ctx.evm);
    ctx.evm.getBalance = async (wallet, contract) => {
      if (wallet === a.wallet.address) throw new Error('boom');
      return original(wallet, contract);
    };
    const results = await recheckHoldings(ctx.deps);
    expect(results).toContainEqual({ streamId: a.streamId, outcome: 'error' });
    expect(results).toContainEqual({ streamId: b.streamId, outcome: 'warned' });
  });

  it('a contract the chain rejects counts as a failed holding, not an outage', async () => {
    const { wallet } = await liveStream();
    ctx.evm.getBalance = async () => {
      throw new TokenNotFoundError('INVALID_PARAMS');
    };
    void wallet;
    ctx.advance(5 * 60_000);
    expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('warned');
  });

  it('T-P0-I10 · two RPC errors do not cut; the third starts the warning', async () => {
    const { streamId } = await liveStream();
    ctx.evm.failing = true;
    for (let i = 0; i < 2; i++) {
      ctx.advance(5 * 60_000);
      expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('rpc_error');
    }
    expect((await status(streamId)).status).toBe('live');
    ctx.advance(5 * 60_000);
    expect((await recheckHoldings(ctx.deps))[0]!.outcome).toBe('warned');
  });
});
