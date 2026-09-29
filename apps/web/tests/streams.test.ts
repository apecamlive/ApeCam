import { TEST_EVM_TOKEN } from '@apecam/core/testing';
import { streams, users } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as nonceRoute } from '@/app/api/auth/nonce/route';
import { POST as verify } from '@/app/api/auth/verify/route';
import { POST as end } from '@/app/api/streams/[id]/end/route';
import { POST as viewToken } from '@/app/api/streams/[id]/view-token/route';
import { POST as eligibility } from '@/app/api/streams/eligibility/route';
import { POST as start } from '@/app/api/streams/start/route';
import { POST as webhook } from '@/app/api/webhooks/livekit/route';
import { call, createWebTestContext, evmSigner } from './helpers';

let ctx: Awaited<ReturnType<typeof createWebTestContext>>;
beforeEach(async () => {
  ctx = await createWebTestContext();
});
afterEach(async () => ctx.close());

async function signIn() {
  const signer = evmSigner();
  const n = (await call(nonceRoute)).json as never;
  const res = await call(verify, { body: await signer.sign(n) });
  return {
    cookie: res.cookie!,
    userId: res.json.user.id as string,
    walletId: res.json.wallet.id as string,
    address: signer.address.toLowerCase(),
  };
}

const startBody = (walletId: string) => ({
  chain: 'base',
  contract: TEST_EVM_TOKEN,
  walletId,
  title: 'gm apes',
  source: 'camera',
  rulesAccepted: true,
});

describe('stream routes', () => {
  it('eligibility requires a session', async () => {
    const res = await call(eligibility, {
      body: { chain: 'base', contract: TEST_EVM_TOKEN, walletId: crypto.randomUUID() },
    });
    expect(res).toMatchObject({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } });
  });

  it('eligibility reports value and shortfall', async () => {
    const me = await signIn();
    ctx.fund(me.address, 42);
    const res = await call(eligibility, {
      cookie: me.cookie,
      body: { chain: 'base', contract: TEST_EVM_TOKEN, walletId: me.walletId },
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      passed: false,
      reasons: ['INSUFFICIENT_HOLDING'],
      usdValue: '42.00',
      shortfallUsd: '58.00',
    });
    expect(res.json.token).toMatchObject({ chain: 'base', ticker: 'TEST' });
  });

  it('invalid body → 400 VALIDATION', async () => {
    const me = await signIn();
    const res = await call(eligibility, {
      cookie: me.cookie,
      body: { chain: 'polygon', contract: 'x', walletId: 'nope' },
    });
    expect(res).toMatchObject({ status: 400, json: { error: { code: 'VALIDATION' } } });
  });

  it('a wallet belonging to another user is not eligible', async () => {
    const me = await signIn();
    const other = await signIn();
    ctx.fund(other.address, 500);
    const res = await call(eligibility, {
      cookie: me.cookie,
      body: { chain: 'base', contract: TEST_EVM_TOKEN, walletId: other.walletId },
    });
    expect(res.json.reasons).toContain('WALLET_NOT_OWNED');
  });

  it('banned user gets 403 USER_BANNED', async () => {
    const me = await signIn();
    await ctx.db
      .update(users)
      .set({ bannedUntil: new Date('2099-01-01') })
      .where(eq(users.id, me.userId));
    const res = await call(start, { cookie: me.cookie, body: startBody(me.walletId) });
    expect(res).toMatchObject({ status: 403, json: { error: { code: 'USER_BANNED' } } });
  });

  it('start → view → end', async () => {
    const me = await signIn();
    ctx.fund(me.address, 150);
    const started = await call(start, { cookie: me.cookie, body: startBody(me.walletId) });
    expect(started.status).toBe(200);
    expect(started.json).toMatchObject({
      wsUrl: 'wss://fake.livekit',
      token: expect.stringContaining('pub-token'),
    });
    const streamId = started.json.streamId as string;

    const anon = await call(viewToken, { params: { id: streamId }, origin: 'http://localhost:3000' });
    expect(anon.json.identity).toMatch(/^a_/);
    const signedIn = await call(viewToken, { params: { id: streamId }, cookie: me.cookie });
    expect(signedIn.json.identity).toBe(`u_${me.userId}`);

    const ended = await call(end, { params: { id: streamId }, cookie: me.cookie });
    expect(ended.json).toEqual({ streamId, status: 'ended' });
  });

  it('T-P0-I12 · webhook with a bad signature is rejected and changes nothing', async () => {
    const me = await signIn();
    ctx.fund(me.address, 150);
    const { streamId, room } = (await call(start, { cookie: me.cookie, body: startBody(me.walletId) })).json;
    ctx.streaming.receiveWebhook = async () => {
      throw new Error('invalid signature');
    };
    const res = await call(webhook, {
      origin: null,
      rawBody: JSON.stringify({
        event: 'track_published',
        room: { name: room },
        participant: { identity: `pub_${me.userId}` },
      }),
      headers: { authorization: 'forged' },
    });
    expect(res).toMatchObject({ status: 401, json: { error: { code: 'BAD_WEBHOOK_SIGNATURE' } } });
    const [s] = await ctx.db.select().from(streams).where(eq(streams.id, streamId));
    expect(s!.status).toBe('starting');
  });

  it('valid webhook marks the stream live (no Origin header needed)', async () => {
    const me = await signIn();
    ctx.fund(me.address, 150);
    const { streamId, room } = (await call(start, { cookie: me.cookie, body: startBody(me.walletId) })).json;
    const res = await call(webhook, {
      origin: null,
      rawBody: JSON.stringify({
        event: 'track_published',
        room: { name: room },
        participant: { identity: `pub_${me.userId}` },
      }),
    });
    expect(res.json).toEqual({ handled: true });
    const [s] = await ctx.db.select().from(streams).where(eq(streams.id, streamId));
    expect(s!.status).toBe('live');
  });
});
