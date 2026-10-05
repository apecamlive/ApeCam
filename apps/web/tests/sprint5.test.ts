import { TEST_EVM_TOKEN } from '@apecam/core/testing';
import { users } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getGoLive, POST as setGoLive } from '@/app/api/admin/go-live/route';
import { DELETE as revoke } from '@/app/api/admin/go-live/invites/[address]/route';
import { POST as invite } from '@/app/api/admin/go-live/invites/route';
import { POST as nonceRoute } from '@/app/api/auth/nonce/route';
import { POST as verify } from '@/app/api/auth/verify/route';
import { GET as me } from '@/app/api/me/route';
import { GET as publicConfig } from '@/app/api/public-config/route';
import { POST as start } from '@/app/api/streams/start/route';
import { call, createWebTestContext, evmSigner } from './helpers';

let ctx: Awaited<ReturnType<typeof createWebTestContext>>;
beforeEach(async () => {
  ctx = await createWebTestContext();
});
afterEach(async () => ctx.close());

async function signIn(role: 'user' | 'moderator' | 'admin' = 'user') {
  const n = (await call(nonceRoute)).json as never;
  const res = await call(verify, { body: await evmSigner().sign(n) });
  const userId = res.json.user.id as string;
  if (role !== 'user') await ctx.db.update(users).set({ role }).where(eq(users.id, userId));
  return {
    cookie: res.cookie!,
    userId,
    walletId: res.json.wallet.id as string,
    address: res.json.wallet.address as string,
  };
}

const startBody = (walletId: string) => ({
  chain: 'base',
  contract: TEST_EVM_TOKEN,
  walletId,
  title: 'beta stream',
  source: 'camera',
  rulesAccepted: true,
  ageConfirmed: true,
});

describe('Sprint 5 · Go Live access API', () => {
  it('T-S5-I5 · a moderator can hit the emergency button; users cannot', async () => {
    const user = await signIn();
    const denied = await call(setGoLive, { cookie: user.cookie, body: { mode: 'closed', reason: 'x' } });
    expect(denied.status).toBe(403);

    const mod = await signIn('moderator');
    const res = await call(setGoLive, {
      cookie: mod.cookie,
      body: { mode: 'closed', reason: 'raid in progress', endLive: true },
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ mode: 'closed', before: 'open' });
    expect((await call(publicConfig, { method: 'GET' })).json).toMatchObject({
      goLiveAccess: 'closed',
      feedbackUrl: null,
    });

    ctx.fund(user.address, 150);
    const refused = await call(start, { cookie: user.cookie, body: startBody(user.walletId) });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe('GO_LIVE_CLOSED');
  });

  it('T-S5-I6 · closed beta: /api/me tells the Studio, invite unlocks, revoke locks again', async () => {
    const admin = await signIn('admin');
    await call(setGoLive, { cookie: admin.cookie, body: { mode: 'invite', reason: 'beta week' } });

    const s = await signIn();
    expect((await call(me, { method: 'GET', cookie: s.cookie })).json.goLive).toMatchObject({
      mode: 'invite',
      allowed: false,
      code: 'GO_LIVE_INVITE_ONLY',
    });

    const inv = await call(invite, {
      cookie: admin.cookie,
      body: { addresses: [s.address, 'nope'], note: 'pons' },
    });
    expect(inv.json).toEqual({ invited: [s.address.toLowerCase()], invalid: ['nope'] });
    expect((await call(me, { method: 'GET', cookie: s.cookie })).json.goLive).toEqual({
      mode: 'invite',
      allowed: true,
    });
    ctx.fund(s.address, 150);
    expect((await call(start, { cookie: s.cookie, body: startBody(s.walletId) })).status).toBe(200);

    const list = await call(getGoLive, { method: 'GET', cookie: admin.cookie });
    expect(list.json.invites).toMatchObject([
      { address: s.address.toLowerCase(), note: 'pons', signedUp: true },
    ]);

    const del = await call(revoke, {
      method: 'DELETE',
      cookie: admin.cookie,
      params: { address: s.address },
    });
    expect(del.status).toBe(200);
    expect((await call(me, { method: 'GET', cookie: s.cookie })).json.goLive.allowed).toBe(false);
  });

  it('rejects an unknown mode', async () => {
    const admin = await signIn('admin');
    const res = await call(setGoLive, { cookie: admin.cookie, body: { mode: 'party', reason: 'x' } });
    expect(res.status).toBe(400);
  });
});
