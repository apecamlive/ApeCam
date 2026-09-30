import { TEST_EVM_TOKEN } from '@apecam/core/testing';
import { streams, users } from '@apecam/db';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as adminReports } from '@/app/api/admin/reports/route';
import { POST as ban } from '@/app/api/admin/wallets/[address]/ban/route';
import { POST as kill } from '@/app/api/admin/streams/[id]/kill/route';
import { POST as nonceRoute } from '@/app/api/auth/nonce/route';
import { POST as verify } from '@/app/api/auth/verify/route';
import { POST as avatar } from '@/app/api/me/avatar/route';
import { POST as embedded } from '@/app/api/me/embedded-wallet/route';
import { GET as me, PATCH as patchMe } from '@/app/api/me/route';
import { POST as linkWallet } from '@/app/api/me/wallets/route';
import { PATCH as setPayout } from '@/app/api/me/wallets/[id]/route';
import { POST as report } from '@/app/api/reports/route';
import { POST as start } from '@/app/api/streams/start/route';
import { GET as profile } from '@/app/api/users/[wallet]/route';
import { call, createWebTestContext, evmSigner, ORIGIN, solanaSigner } from './helpers';

let ctx: Awaited<ReturnType<typeof createWebTestContext>>;
beforeEach(async () => {
  ctx = await createWebTestContext();
});
afterEach(async () => ctx.close());

async function nonce() {
  return (await call(nonceRoute)).json as {
    nonce: string;
    issuedAt: string;
    expirationTime: string;
    statement: string;
  };
}

type Signer = ReturnType<typeof evmSigner> | ReturnType<typeof solanaSigner>;

async function signIn(signer: Signer = evmSigner()) {
  const res = await call(verify, { body: await signer.sign(await nonce()) });
  return {
    signer,
    status: res.status,
    cookie: res.cookie!,
    userId: res.json.user?.id as string,
    walletId: res.json.wallet?.id as string,
    address: res.json.wallet?.address as string,
  };
}

async function liveStreamer() {
  const s = await signIn();
  ctx.fund(s.address, 150);
  const res = await call(start, {
    cookie: s.cookie,
    body: {
      chain: 'base',
      contract: TEST_EVM_TOKEN,
      walletId: s.walletId,
      title: 'gm apes',
      source: 'camera',
      rulesAccepted: true,
      ageConfirmed: true,
    },
  });
  return { ...s, streamId: res.json.streamId as string };
}

async function makeModerator() {
  const m = await signIn();
  await ctx.db.update(users).set({ role: 'moderator' }).where(eq(users.id, m.userId));
  return m;
}

describe('admin routes', () => {
  it('T-S2-I3 · a regular user gets 403 on admin endpoints; a moderator gets 200', async () => {
    const user = await signIn();
    expect(await call(adminReports, { method: 'GET', cookie: user.cookie })).toMatchObject({ status: 403 });
    const mod = await makeModerator();
    // Role comes from the database, so promotion works without signing in again.
    expect((await call(adminReports, { method: 'GET', cookie: mod.cookie })).status).toBe(200);
  });

  it('kill requires a reason', async () => {
    const { streamId } = await liveStreamer();
    const mod = await makeModerator();
    const res = await call(kill, { cookie: mod.cookie, params: { id: streamId }, body: { reason: '' } });
    expect(res.status).toBe(400);
  });

  it('T-S2-I5 · ban: live stream ended, old session rejected, signing in again refused', async () => {
    const streamer = await liveStreamer();
    const mod = await makeModerator();
    const res = await call(ban, {
      cookie: mod.cookie,
      params: { address: streamer.address },
      body: { until: 'permanent', reason: 'scam stream' },
    });
    expect(res.json.streamsEnded).toBe(1);
    const [s] = await ctx.db.select().from(streams).where(eq(streams.id, streamer.streamId));
    expect(s!.status).toBe('killed');

    // Old session no longer authenticates.
    expect((await call(me, { method: 'GET', cookie: streamer.cookie })).json.user).toBeNull();
    // Signing in again with the same wallet is refused.
    const again = await call(verify, { body: await streamer.signer.sign(await nonce()) });
    expect(again).toMatchObject({ status: 403, json: { error: { code: 'USER_BANNED' } } });
  });
});

describe('reports route', () => {
  it('report once → 200, twice → 409', async () => {
    const { streamId } = await liveStreamer();
    const viewer = await signIn();
    const body = { streamId, category: 'scam', reason: 'fake giveaway' };
    expect((await call(report, { cookie: viewer.cookie, body })).status).toBe(200);
    expect(await call(report, { cookie: viewer.cookie, body })).toMatchObject({
      status: 409,
      json: { error: { code: 'ALREADY_REPORTED' } },
    });
  });

  it('unknown category → 400; signed out → 401', async () => {
    const { streamId } = await liveStreamer();
    const viewer = await signIn();
    expect(
      (await call(report, { cookie: viewer.cookie, body: { streamId, category: 'boring' } })).status,
    ).toBe(400);
    expect((await call(report, { body: { streamId, category: 'spam' } })).status).toBe(401);
  });
});

describe('profile and wallets', () => {
  it('links a Solana wallet to an EVM account with a fresh signature', async () => {
    const acct = await signIn();
    const sol = solanaSigner();
    const res = await call(linkWallet, { cookie: acct.cookie, body: await sol.sign(await nonce()) });
    expect(res.json.wallet).toMatchObject({ family: 'solana', address: sol.address });
    const mine = await call(me, { method: 'GET', cookie: acct.cookie });
    expect(mine.json.wallets).toHaveLength(2);
  });

  it('T-S2-I8 · linking a wallet that another account uses → 409', async () => {
    const other = await signIn();
    const acct = await signIn();
    const res = await call(linkWallet, { cookie: acct.cookie, body: await other.signer.sign(await nonce()) });
    expect(res).toMatchObject({ status: 409, json: { error: { code: 'WALLET_TAKEN' } } });
  });

  it('T-S2-I9 · Solana wallet cannot be the payout wallet (400); EVM can', async () => {
    const acct = await signIn(solanaSigner());
    expect(
      await call(setPayout, {
        method: 'PATCH',
        cookie: acct.cookie,
        params: { id: acct.walletId },
        body: { payout: true },
      }),
    ).toMatchObject({ status: 400, json: { error: { code: 'PAYOUT_MUST_BE_EVM' } } });
    const evm = await signIn();
    expect(
      (
        await call(setPayout, {
          method: 'PATCH',
          cookie: evm.cookie,
          params: { id: evm.walletId },
          body: { payout: true },
        })
      ).status,
    ).toBe(200);
  });

  it('T-S2-I10 · embedded wallet: an address in the request body is ignored', async () => {
    const acct = await signIn(solanaSigner());
    const real = '0x00000000000000000000000000000000000abcde';
    ctx.embeddedWallets.byUser.set(acct.userId, real);
    const res = await call(embedded, {
      cookie: acct.cookie,
      body: { address: '0x000000000000000000000000000000000000dead' },
    });
    expect(res.json).toMatchObject({ address: real, isPayout: true });
  });

  it('display name update and public profile', async () => {
    const acct = await signIn();
    expect(
      (await call(patchMe, { method: 'PATCH', cookie: acct.cookie, body: { displayName: 'ape king' } })).json,
    ).toEqual({
      displayName: 'ape king',
    });
    expect(
      (await call(patchMe, { method: 'PATCH', cookie: acct.cookie, body: { displayName: 'x' } })).status,
    ).toBe(400);
    const pub = await call(profile, { method: 'GET', params: { wallet: acct.address } });
    expect(pub.json.user.displayName).toBe('ape king');
  });
});

describe('T-S2-I12 · avatar upload', () => {
  async function upload(cookie: string, blob: Blob) {
    const form = new FormData();
    form.set('file', blob, 'avatar');
    const req = new Request(`${ORIGIN}/api/me/avatar`, {
      method: 'POST',
      headers: { origin: ORIGIN, cookie },
      body: form,
    });
    const res = await avatar(req, { params: Promise.resolve({}) });
    return { status: res.status, json: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  it('a real PNG is resized to a 256px WebP and stored', async () => {
    const acct = await signIn();
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#1d4ed8' } })
      .png()
      .toBuffer();
    const res = await upload(acct.cookie, new Blob([new Uint8Array(png)], { type: 'image/png' }));
    expect(res.status).toBe(200);
    expect(res.json.avatarUrl).toMatch(/^https:\/\/files\.test\/avatars\/.+\.webp$/);
    const stored = [...ctx.files.stored.values()][0]!;
    const meta = await sharp(Buffer.from(stored.body)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
  });

  it('files over 1 MB are rejected', async () => {
    const acct = await signIn();
    const res = await upload(acct.cookie, new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/png' }));
    expect(res).toMatchObject({ status: 400, json: { error: { code: 'AVATAR_TOO_BIG' } } });
  });

  it('non-images are rejected, even when they claim to be images', async () => {
    const acct = await signIn();
    expect((await upload(acct.cookie, new Blob(['hello'], { type: 'text/plain' }))).json.error.code).toBe(
      'AVATAR_TYPE',
    );
    expect((await upload(acct.cookie, new Blob(['<script>'], { type: 'image/png' }))).json.error.code).toBe(
      'AVATAR_INVALID',
    );
  });
});
