import { APECAM_TEST } from '@apecam/core/testing';
import { rewards, users } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getConfig, PATCH as patchConfig } from '@/app/api/admin/config/route';
import { GET as csv } from '@/app/api/admin/payouts/[id]/csv/route';
import { GET as listPayouts, POST as createBatch } from '@/app/api/admin/payouts/route';
import { POST as voidRoute } from '@/app/api/admin/rewards/[id]/void/route';
import { POST as nonceRoute } from '@/app/api/auth/nonce/route';
import { POST as verify } from '@/app/api/auth/verify/route';
import { GET as myRewards } from '@/app/api/me/rewards/route';
import { PATCH as setPayout } from '@/app/api/me/wallets/[id]/route';
import { GET as summary } from '@/app/api/tracker/summary/route';
import { setDeps } from '@/lib/server/deps';
import { call, createWebTestContext, evmSigner, ORIGIN } from './helpers';

let ctx: Awaited<ReturnType<typeof createWebTestContext>>;
beforeEach(async () => {
  ctx = await createWebTestContext();
});
afterEach(async () => ctx.close());

const E18 = 10n ** 18n;

async function signIn(role: 'user' | 'moderator' | 'admin' = 'user') {
  const signer = evmSigner();
  const n = (await call(nonceRoute)).json as never;
  const res = await call(verify, { body: await signer.sign(n) });
  const userId = res.json.user.id as string;
  if (role !== 'user') await ctx.db.update(users).set({ role }).where(eq(users.id, userId));
  return {
    cookie: res.cookie!,
    userId,
    walletId: res.json.wallet.id as string,
    address: res.json.wallet.address as string,
  };
}

describe('config', () => {
  it('T-S3-I13 · a moderator cannot change settings (403); an admin can, with validation', async () => {
    const mod = await signIn('moderator');
    expect(
      (
        await call(patchConfig, {
          method: 'PATCH',
          cookie: mod.cookie,
          body: { key: 's2e.min_viewers', value: 1 },
        })
      ).status,
    ).toBe(403);

    const admin = await signIn('admin');
    const ok = await call(patchConfig, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { key: 'go_live.bonding_curve_min_mcap_usd', value: 25_000 },
    });
    expect(ok.json).toEqual({ key: 'go_live.bonding_curve_min_mcap_usd', value: 25_000 });

    const bad = [
      { key: 'no.such.key', value: 1 },
      { key: 's2e.min_viewers', value: 'three' },
      { key: 's2e.tiers', value: [[10, -5]] },
    ];
    for (const body of bad)
      expect((await call(patchConfig, { method: 'PATCH', cookie: admin.cookie, body })).status).toBe(400);

    const list = await call(getConfig, { method: 'GET', cookie: admin.cookie });
    expect(list.json.settings.find((s: { key: string }) => s.key === 's2e.daily_cap')).toMatchObject({
      value: 5000,
      defaultValue: 5000,
    });
  });
});

describe('payout routes', () => {
  it('admin creates the batch, downloads the CSV, voids nothing twice; moderators are refused', async () => {
    const streamer = await signIn();
    await call(setPayout, {
      method: 'PATCH',
      cookie: streamer.cookie,
      params: { id: streamer.walletId },
      body: { payout: true },
    });
    const [r] = await ctx.db
      .insert(rewards)
      .values({
        userId: streamer.userId,
        period: '2026-09-30',
        validMinutes: 100,
        apecamAmount: (5000n * E18).toString(),
        status: 'pending',
      })
      .returning();
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.treasury, 10n ** 9n * E18);
    ctx.advance(Date.UTC(2026, 9, 5, 9) - ctx.deps.now!().getTime()); // Monday Oct 5

    const mod = await signIn('moderator');
    expect((await call(createBatch, { cookie: mod.cookie, body: {} })).status).toBe(403);

    const admin = await signIn('admin');
    const created = await call(createBatch, { cookie: admin.cookie, body: {} });
    expect(created.json).toMatchObject({ rewards: 1, factor: 1 });

    const req = new Request(`${ORIGIN}/api/admin/payouts/x/csv`, { headers: { cookie: admin.cookie } });
    const res = await csv(req, { params: Promise.resolve({ id: created.json.batchId }) });
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(await res.text()).toBe(`wallet,amount_raw,amount\n${streamer.address},${5000n * E18},5000`);

    const listed = await call(listPayouts, { method: 'GET', cookie: admin.cookie });
    expect(listed.json.batches[0].lines).toEqual([
      { wallet: streamer.address, amountRaw: (5000n * E18).toString(), amount: '5000', paid: false },
    ]);

    // Batched rewards can still be voided before payment; a second void is refused.
    expect(
      (
        await call(voidRoute, {
          cookie: admin.cookie,
          params: { id: r!.id },
          body: { reason: 'viewer ring' },
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(voidRoute, { cookie: admin.cookie, params: { id: r!.id }, body: { reason: 'again' } }))
        .status,
    ).toBe(409);
  });

  it('streamers see their own rewards', async () => {
    const s = await signIn();
    await ctx.db.insert(rewards).values({
      userId: s.userId,
      period: '2026-09-30',
      validMinutes: 12,
      apecamAmount: (1000n * E18).toString(),
      status: 'pending',
    });
    const res = await call(myRewards, { method: 'GET', cookie: s.cookie });
    expect(res.json.totals.pendingRaw).toBe((1000n * E18).toString());
    expect((await call(myRewards, { method: 'GET' })).status).toBe(401);
  });
});

describe('tracker route', () => {
  it('summary is public', async () => {
    ctx.apecamSource.balances.set(APECAM_TEST.wallets.burn, 1000n * E18);
    const res = await call(summary, { method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ burnedRaw: (1000n * E18).toString(), wallets: expect.any(Array) });
  });

  it('503 TRACKER_NOT_CONFIGURED until the owner provides addresses', async () => {
    setDeps({ ...ctx.deps, apecam: undefined });
    const res = await call(summary, { method: 'GET' });
    expect(res).toMatchObject({ status: 503, json: { error: { code: 'TRACKER_NOT_CONFIGURED' } } });
  });
});
