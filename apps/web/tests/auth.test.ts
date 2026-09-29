import { users, wallets } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as jwks } from '@/app/.well-known/jwks.json/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as nonceRoute } from '@/app/api/auth/nonce/route';
import { POST as verify } from '@/app/api/auth/verify/route';
import { GET as me } from '@/app/api/me/route';
import { call, createWebTestContext, evmSigner, solanaSigner } from './helpers';

let ctx: Awaited<ReturnType<typeof createWebTestContext>>;
beforeEach(async () => {
  ctx = await createWebTestContext();
});
afterEach(async () => ctx.close());

async function getNonce() {
  const res = await call(nonceRoute);
  expect(res.status).toBe(200);
  return res.json as { nonce: string; issuedAt: string; expirationTime: string; statement: string };
}

describe('sign-in', () => {
  it('T-P0-U1 · nonce response carries the SIWE fields', async () => {
    const n = await getNonce();
    expect(n.nonce).toMatch(/^[0-9a-f]{24}$/);
    expect(n).toMatchObject({ domain: 'localhost:3000', uri: 'http://localhost:3000' });
    expect(new Date(n.expirationTime).getTime() - new Date(n.issuedAt).getTime()).toBe(300_000);
    expect(n.statement).toContain('not a transaction');
  });

  it('T-P0-I1 · EVM login end-to-end → session cookie, user + wallet stored', async () => {
    const signer = evmSigner();
    const res = await call(verify, { body: await signer.sign(await getNonce()) });

    expect(res.status).toBe(200);
    expect(res.cookie).toMatch(/^apecam_session=ey/);
    expect(res.json.wallet).toMatchObject({ family: 'evm', address: signer.address.toLowerCase() });
    const meRes = await call(me, { method: 'GET', cookie: res.cookie });
    expect(meRes.json.user.id).toBe(res.json.user.id);
  });

  it('T-P0-I2 · Solana login end-to-end', async () => {
    const signer = solanaSigner();
    const res = await call(verify, { body: await signer.sign(await getNonce()) });
    expect(res.status).toBe(200);
    expect(res.json.wallet).toMatchObject({ family: 'solana', address: signer.address });
  });

  it('logging in again with the same wallet returns the same user', async () => {
    const signer = solanaSigner();
    const a = await call(verify, { body: await signer.sign(await getNonce()) });
    const b = await call(verify, { body: await signer.sign(await getNonce()) });
    expect(b.json.user.id).toBe(a.json.user.id);
    expect(await ctx.db.select().from(users)).toHaveLength(1);
  });

  it('T-P0-I3 · a nonce works only once', async () => {
    const signer = evmSigner();
    const body = await signer.sign(await getNonce());
    expect((await call(verify, { body })).status).toBe(200);
    const replay = await call(verify, { body });
    expect(replay.status).toBe(401);
    expect(replay.json.error.message).toContain('nonce');
  });

  it('T-P0-I4 · expired message (> 5 min) is rejected', async () => {
    const signer = evmSigner();
    const body = await signer.sign(await getNonce());
    ctx.advance(5 * 60_000 + 1);
    const res = await call(verify, { body });
    expect(res.status).toBe(401);
    expect(res.json.error.message).toContain('expired');
  });

  it('T-P0-I5 · signature for another domain is rejected (EVM and Solana)', async () => {
    const e = await call(verify, {
      body: await evmSigner().sign(await getNonce(), { domain: 'evil.example' }),
    });
    const s = await call(verify, {
      body: await solanaSigner().sign(await getNonce(), { domain: 'evil.example' }),
    });
    expect([e.status, s.status]).toEqual([401, 401]);
  });

  it('a signature from a different key is rejected, and does not burn the nonce', async () => {
    const n = await getNonce();
    const real = await solanaSigner().sign(n);
    const forged = { ...real, signature: (await solanaSigner().sign(n)).signature };
    expect((await call(verify, { body: forged })).status).toBe(401);
    expect((await call(verify, { body: real })).status).toBe(200);
  });

  it('unsupported EVM chain id is rejected', async () => {
    const res = await call(verify, { body: await evmSigner().sign(await getNonce(), { chainId: 137 }) });
    expect(res.status).toBe(401);
  });

  it('cross-origin POST is rejected (CSRF)', async () => {
    const res = await call(nonceRoute, { origin: 'https://evil.example' });
    expect(res).toMatchObject({ status: 403, json: { error: { code: 'BAD_ORIGIN' } } });
  });

  it('logout revokes the session', async () => {
    const res = await call(verify, { body: await evmSigner().sign(await getNonce()) });
    await call(logout, { cookie: res.cookie });
    expect((await call(me, { method: 'GET', cookie: res.cookie })).json.user).toBeNull();
  });

  it('a forged cookie is ignored', async () => {
    const res = await call(me, {
      method: 'GET',
      cookie: 'apecam_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.x',
    });
    expect(res.json.user).toBeNull();
  });

  it('JWKS publishes only the public key', async () => {
    const res = await call(jwks, { method: 'GET' });
    expect(res.json.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' });
    expect(res.json.keys[0].d).toBeUndefined();
  });

  it('stores EVM addresses lowercase', async () => {
    const signer = evmSigner();
    await call(verify, { body: await signer.sign(await getNonce()) });
    const [w] = await ctx.db.select().from(wallets).where(eq(wallets.address, signer.address.toLowerCase()));
    expect(w).toBeDefined();
  });
});
