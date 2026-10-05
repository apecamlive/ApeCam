import { handleLivekitEvent, startStream } from '@apecam/core';
import { TEST_EVM_TOKEN } from '@apecam/core/testing';
import { users } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as health } from '@/app/api/admin/health/route';
import { POST as nonceRoute } from '@/app/api/auth/nonce/route';
import { POST as ban } from '@/app/api/admin/wallets/[address]/ban/route';
import { POST as verify } from '@/app/api/auth/verify/route';
import { PATCH as patchMe } from '@/app/api/me/route';
import { POST as report } from '@/app/api/reports/route';
import { POST as chat, GET as chatGet } from '@/app/api/streams/[id]/chat/route';
import { POST as start } from '@/app/api/streams/start/route';
import { GET as search } from '@/app/api/tokens/search/route';
import { clientIp } from '@/lib/server/http';
import { call, createWebTestContext, evmSigner } from './helpers';

let ctx: Awaited<ReturnType<typeof createWebTestContext>>;
beforeEach(async () => {
  ctx = await createWebTestContext();
});
afterEach(async () => ctx.close());

const ip = (addr: string) => ({ 'x-forwarded-for': addr });

describe('rate limits (S4-6)', () => {
  it('T-S4-I1 · 11th nonce request in a minute from one IP → 429 with Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call(nonceRoute, { headers: ip('1.1.1.1') })).status).toBe(200);
    }
    const blocked = await call(nonceRoute, { headers: ip('1.1.1.1') });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(60);

    // Another IP is unaffected.
    expect((await call(nonceRoute, { headers: ip('2.2.2.2') })).status).toBe(200);
  });

  it('search allows 60/min per IP', async () => {
    const get = () => call(search, { method: 'GET', headers: ip('3.3.3.3') });
    for (let i = 0; i < 60; i++) expect((await get()).status).not.toBe(429);
    expect((await get()).status).toBe(429);
  });

  it('reports are limited per user (5/h), not per IP', async () => {
    const n = (await call(nonceRoute)).json as never;
    const res = await call(verify, { body: await evmSigner().sign(n) });
    const cookie = res.cookie!;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      // Different IP each time; the limit still follows the signed-in user.
      const r = await call(report, { cookie, body: { streamId: crypto.randomUUID(), category: 'spam' } });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });

  it('client IP: CF-Connecting-IP, else the last X-Forwarded-For hop (earlier hops are client-controlled)', () => {
    const req = (h: Record<string, string>) => new Request('http://x', { headers: h });
    expect(clientIp(req({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1' }))).toBe('1.1.1.1');
    expect(clientIp(req({}))).toBe('unknown');
  });
});

async function signIn(role: 'user' | 'moderator' | 'admin' = 'user') {
  const n = (await call(nonceRoute)).json as never;
  const res = await call(verify, { body: await evmSigner().sign(n) });
  const userId = res.json.user.id as string;
  if (role !== 'user') await ctx.db.update(users).set({ role }).where(eq(users.id, userId));
  return res.cookie!;
}

describe('admin health (S4-9)', () => {
  it('admins see job states; moderators and users get 403', async () => {
    const admin = await call(health, { method: 'GET', cookie: await signIn('admin') });
    expect(admin.status).toBe(200);
    expect(admin.json.jobs.map((j: { name: string }) => j.name)).toContain('count-minutes');
    expect(admin.json.tracker.configured).toBe(true);

    expect((await call(health, { method: 'GET', cookie: await signIn('moderator') })).status).toBe(403);
    expect((await call(health, { method: 'GET', cookie: await signIn() })).status).toBe(403);
    expect((await call(health, { method: 'GET' })).status).toBe(401);
  });
});

const XSS = `<img src=x onerror="alert(1)"><script>alert('x')</script>`;

describe('T-S4-I3 · cross-site writes', () => {
  it('every mutating endpoint rejects a foreign Origin even with a valid session', async () => {
    const cookie = await signIn('admin');
    const evil = { origin: 'https://evil.example', cookie };
    for (const [handler, method, params] of [
      [report, 'POST', {}],
      [patchMe, 'PATCH', {}],
      [start, 'POST', {}],
      [ban, 'POST', { address: '0x0000000000000000000000000000000000000001' }],
      [chat, 'POST', { id: crypto.randomUUID() }],
    ] as const) {
      const res = await call(handler, { ...evil, method, params, body: {} });
      expect(res.status, `${method} ${handler.name}`).toBe(403);
      expect(res.json.error.code).toBe('BAD_ORIGIN');
    }
  });
});

describe('T-S4-I4 · XSS payloads are stored and returned as plain text', () => {
  it('chat and stream titles round-trip verbatim as JSON; display names refuse markup', async () => {
    const n = (await call(nonceRoute)).json as never;
    const signer = evmSigner();
    const res = await call(verify, { body: await signer.sign(n) });
    const cookie = res.cookie!;
    ctx.fund(res.json.wallet.address, 150);
    const s = await startStream(ctx.deps, {
      userId: res.json.user.id,
      walletId: res.json.wallet.id,
      chain: 'base',
      contract: TEST_EVM_TOKEN,
      title: XSS.slice(0, 80),
      source: 'camera',
      rulesAccepted: true,
      ageConfirmed: true,
    });
    await handleLivekitEvent(ctx.deps, {
      event: 'track_published',
      room: { name: s.room },
      participant: { identity: `pub_${res.json.user.id}` },
    });

    const sent = await call(chat, { cookie, params: { id: s.streamId }, body: { body: XSS } });
    expect(sent.status).toBe(200);
    const read = await call(chatGet, { method: 'GET', params: { id: s.streamId } });
    expect(read.json.messages.at(-1).body).toBe(XSS); // React renders this as text; no HTML sanitising needed
    expect(read.headers.get('content-type')).toContain('application/json');

    const name = await call(patchMe, { method: 'PATCH', cookie, body: { displayName: '<b>ape</b>' } });
    expect(name.status).toBe(400);
    expect(name.json.error.code).toBe('NAME_CHARS');
  });
});
