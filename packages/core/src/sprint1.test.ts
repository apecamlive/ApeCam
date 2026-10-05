import { chatMessages, streams, tokens } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recentChat, sendChatMessage, validateChatBody } from './chat';
import { getFeed, trendingScore } from './feed';
import sharp from 'sharp';
import { frameCheck } from './frames';
import { refreshPrices, sweepStreams } from './jobs';
import { searchTokens } from './search';
import { startStream } from './streams';
import { createTestContext, quote, TEST_EVM_TOKEN } from './testing';
import { resolveLogo } from './tokens';
import { handleLivekitEvent } from './webhooks';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeEach(async () => {
  ctx = await createTestContext();
});
afterEach(async () => ctx.close());

async function goLive(opts: { contract?: string; title?: string; usd?: number } = {}) {
  const contract = opts.contract ?? TEST_EVM_TOKEN;
  const { user, wallets } = await ctx.createUser();
  ctx.fund(wallets[0]!.address, opts.usd ?? 150, contract);
  const s = await startStream(ctx.deps, {
    userId: user.id,
    walletId: wallets[0]!.id,
    chain: 'base',
    contract,
    title: opts.title ?? 'gm',
    source: 'camera',
    rulesAccepted: true,
    ageConfirmed: true,
  });
  await handleLivekitEvent(ctx.deps, {
    event: 'track_published',
    room: { name: s.room },
    participant: { identity: `pub_${user.id}` },
  });
  return { user, wallet: wallets[0]!, ...s };
}

const get = async (id: string) => (await ctx.db.select().from(streams).where(eq(streams.id, id)))[0]!;

describe('S1-2 / S1-3 · token metadata', () => {
  it('T-S1-U2 · logo fallback: DexScreener → metadata image → placeholder', async () => {
    const meta = 'https://ipfs.io/ipfs/meta.json';
    const okFetch = (async () =>
      new Response(JSON.stringify({ image: 'https://ipfs.io/ipfs/img.png' }))) as typeof fetch;
    const badFetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;

    expect(await resolveLogo(quote('1'), meta, okFetch)).toEqual({
      logoUrl: 'https://img/test.png',
      logoSource: 'dexscreener',
    });
    expect(await resolveLogo(quote('1', { imageUrl: null }), meta, okFetch)).toEqual({
      logoUrl: 'https://ipfs.io/ipfs/img.png',
      logoSource: 'launchpad',
    });
    expect(await resolveLogo(quote('1', { imageUrl: null }), meta, badFetch)).toEqual({
      logoUrl: null,
      logoSource: 'placeholder',
    });
    expect(await resolveLogo(null, undefined)).toEqual({ logoUrl: null, logoSource: 'placeholder' });
  });
});

describe('S1-5 · webhooks', () => {
  it('T-S1-I1 · 5 viewers join, 2 leave → current 3, peak 5 (streamer excluded)', async () => {
    const { streamId, room, user } = await goLive();
    ctx.streaming.join(room, `pub_${user.id}`);
    for (let i = 0; i < 5; i++) {
      ctx.streaming.join(room, `a_viewer${i}`);
      await handleLivekitEvent(ctx.deps, {
        event: 'participant_joined',
        room: { name: room },
        participant: { identity: `a_viewer${i}` },
      });
    }
    for (let i = 0; i < 2; i++) {
      ctx.streaming.leave(room, `a_viewer${i}`);
      await handleLivekitEvent(ctx.deps, {
        event: 'participant_left',
        room: { name: room },
        participant: { identity: `a_viewer${i}` },
      });
    }
    expect(await get(streamId)).toMatchObject({ currentViewers: 3, peakViewers: 5 });
  });

  it("T-S1-I2 · duplicate webhooks don't double count; streamer's own viewer tab is excluded", async () => {
    const { streamId, room, user } = await goLive();
    ctx.streaming.join(room, 'a_x');
    ctx.streaming.join(room, `u_${user.id}`);
    const ev = { event: 'participant_joined', room: { name: room }, participant: { identity: 'a_x' } };
    await handleLivekitEvent(ctx.deps, ev);
    await handleLivekitEvent(ctx.deps, ev);
    expect(await get(streamId)).toMatchObject({ currentViewers: 1, peakViewers: 1 });
  });

  it('first published track starts snapshot egress once', async () => {
    const { room, user } = await goLive();
    await handleLivekitEvent(ctx.deps, {
      event: 'track_published',
      room: { name: room },
      participant: { identity: `pub_${user.id}` },
    });
    expect(ctx.streaming.snapshotsStarted).toEqual([room]);
  });

  it('room_finished ends the stream', async () => {
    const { streamId, room } = await goLive();
    await handleLivekitEvent(ctx.deps, { event: 'room_finished', room: { name: room } });
    expect(await get(streamId)).toMatchObject({ status: 'ended', endReason: 'disconnected' });
  });
});

describe('S1-7 · feed', () => {
  it('T-S1-U4 · trending score rewards growth and chat', () => {
    expect(trendingScore({ viewersNow: 50, viewers15mAgo: 45, chat15m: 3 })).toBe(13);
    expect(trendingScore({ viewersNow: 20, viewers15mAgo: 0, chat15m: 30 })).toBe(70);
    expect(trendingScore({ viewersNow: 5, viewers15mAgo: 40, chat15m: 0 })).toBe(0);
  });

  it('live tab sorts by viewers; new tab by start time', async () => {
    const a = await goLive({ title: 'first' });
    ctx.advance(60_000);
    const b = await goLive({ title: 'second' });
    await ctx.db.update(streams).set({ currentViewers: 10 }).where(eq(streams.id, a.streamId));
    await ctx.db.update(streams).set({ currentViewers: 3 }).where(eq(streams.id, b.streamId));

    expect((await getFeed(ctx.deps, 'live')).items.map((i) => i.title)).toEqual(['first', 'second']);
    expect((await getFeed(ctx.deps, 'new')).items.map((i) => i.title)).toEqual(['second', 'first']);
  });

  it('trending tab puts the chattiest stream first', async () => {
    const quiet = await goLive({ title: 'quiet' });
    const busy = await goLive({ title: 'busy' });
    for (let i = 0; i < 5; i++)
      await ctx.db
        .insert(chatMessages)
        .values({ streamId: busy.streamId, userId: busy.user.id, body: 'gm', createdAt: ctx.deps.now!() });
    const feed = await getFeed(ctx.deps, 'trending');
    expect(feed.items.map((i) => i.title)).toEqual(['busy', 'quiet']);
    expect(feed.items[0]!.trendingScore).toBe(5);
    void quiet;
  });

  it('T-S1-I3 · hidden tokens and blurred streams never appear', async () => {
    const hiddenToken = '0x00000000000000000000000000000000000000cc';
    const a = await goLive({ title: 'hidden-token', contract: hiddenToken });
    const b = await goLive({ title: 'blurred' });
    await goLive({ title: 'visible' });
    await ctx.db.update(tokens).set({ hidden: true }).where(eq(tokens.contract, hiddenToken));
    await ctx.db.update(streams).set({ blurred: true }).where(eq(streams.id, b.streamId));
    void a;
    for (const tab of ['live', 'trending', 'new'] as const) {
      expect((await getFeed(ctx.deps, tab)).items.map((i) => i.title)).toEqual(['visible']);
    }
  });
});

describe('S1-10 · chat', () => {
  it('T-S1-U5 · empty, too long, and links are rejected', () => {
    expect(() => validateChatBody('   ', 200)).toThrow(expect.objectContaining({ code: 'CHAT_EMPTY' }));
    expect(() => validateChatBody('x'.repeat(201), 200)).toThrow(
      expect.objectContaining({ code: 'CHAT_TOO_LONG' }),
    );
    for (const link of ['check https://x.io', 'go to www.scam', 'pump.fun/abc', 'mint at apecam.xyz']) {
      expect(() => validateChatBody(link, 200)).toThrow(expect.objectContaining({ code: 'CHAT_LINK' }));
    }
    expect(validateChatBody('  gm   apes  ', 200)).toBe('gm apes');
    expect(validateChatBody('price at 0.5 lol', 200)).toBe('price at 0.5 lol');
  });

  it('stores, broadcasts over LiveKit and returns recent messages in order', async () => {
    const { streamId, room } = await goLive();
    const { user: viewer } = await ctx.createUser();
    await sendChatMessage(ctx.deps, { userId: viewer.id, streamId, body: 'gm' });
    ctx.advance(2_000);
    await sendChatMessage(ctx.deps, { userId: viewer.id, streamId, body: 'wagmi' });
    expect(ctx.streaming.sent.filter((s) => s.topic === 'chat' && s.room === room)).toHaveLength(2);
    expect((await recentChat(ctx.deps, streamId)).map((m) => m.body)).toEqual(['gm', 'wagmi']);
  });

  it('T-S1-I6 · three messages within a second → second and third are rate limited', async () => {
    const { streamId } = await goLive();
    const { user: viewer } = await ctx.createUser();
    await sendChatMessage(ctx.deps, { userId: viewer.id, streamId, body: '1' });
    await expect(sendChatMessage(ctx.deps, { userId: viewer.id, streamId, body: '2' })).rejects.toMatchObject(
      { status: 429 },
    );
    await expect(sendChatMessage(ctx.deps, { userId: viewer.id, streamId, body: '3' })).rejects.toMatchObject(
      { status: 429 },
    );
  });

  it('deleted messages are not returned', async () => {
    const { streamId } = await goLive();
    const { user: viewer } = await ctx.createUser();
    const m = await sendChatMessage(ctx.deps, { userId: viewer.id, streamId, body: 'bad' });
    await ctx.db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, m.id));
    expect(await recentChat(ctx.deps, streamId)).toEqual([]);
  });
});

describe('S1-11 · search', () => {
  it('T-S1-I7 · duplicate tickers all appear, sorted by market cap', async () => {
    await ctx.db.insert(tokens).values([
      {
        chain: 'solana',
        contract: 'So1aPepe111111111111111111111111111111111',
        ticker: 'PEPE',
        marketCapUsd: '5000',
      },
      {
        chain: 'base',
        contract: '0x0000000000000000000000000000000000000001',
        ticker: 'PEPE',
        marketCapUsd: '900000',
      },
      {
        chain: 'bsc',
        contract: '0x0000000000000000000000000000000000000002',
        ticker: 'PEPE',
        marketCapUsd: '42000',
      },
      {
        chain: 'base',
        contract: '0x0000000000000000000000000000000000000003',
        ticker: 'DOGE',
        marketCapUsd: '1',
      },
    ]);
    const res = await searchTokens(ctx.deps, 'pepe');
    expect(res.map((r) => [r.chain, r.marketCapUsd])).toEqual([
      ['base', '900000'],
      ['bsc', '42000'],
      ['solana', '5000'],
    ]);
  });

  it('T-S1-I8 · unknown contract is looked up and stored', async () => {
    const addr = '0x00000000000000000000000000000000000000dd';
    ctx.prices.quotes.set(addr, quote('2', { ticker: 'NEWT', name: 'Newt' }));
    const res = await searchTokens(
      { ...ctx.deps, findPairsByAddress: async () => [{ chainSlug: 'base' }] },
      addr,
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ chain: 'base', contract: addr, ticker: 'NEWT' });
    expect(await ctx.db.select().from(tokens).where(eq(tokens.contract, addr))).toHaveLength(1);
  });

  it('marks tokens that are live right now', async () => {
    await goLive();
    const res = await searchTokens(ctx.deps, TEST_EVM_TOKEN);
    expect(res[0]!.live).toBe(1);
  });

  it('random text returns nothing', async () => {
    expect(await searchTokens(ctx.deps, 'zzqqxx')).toEqual([]);
    expect(await searchTokens(ctx.deps, 'a')).toEqual([]);
  });
});

describe('S1-4 / S1-6 · jobs', () => {
  it('T-S1-I9 · stale-streams: starting > 2 min → ended (error)', async () => {
    const { user, wallets } = await ctx.createUser();
    ctx.fund(wallets[0]!.address, 150);
    const s = await startStream(ctx.deps, {
      userId: user.id,
      walletId: wallets[0]!.id,
      chain: 'base',
      contract: TEST_EVM_TOKEN,
      title: 'gm',
      source: 'camera',
      rulesAccepted: true,
      ageConfirmed: true,
    });
    await ctx.db.update(streams).set({ createdAt: ctx.deps.now!() }).where(eq(streams.id, s.streamId));
    ctx.advance(121_000);
    expect(await sweepStreams(ctx.deps)).toMatchObject({ expired: 1 });
    expect(await get(s.streamId)).toMatchObject({ status: 'ended', endReason: 'error' });
  });

  it('stale-streams: live stream whose room vanished → ended', async () => {
    const { streamId, room } = await goLive();
    ctx.streaming.rooms.delete(room);
    expect(await sweepStreams(ctx.deps)).toMatchObject({ orphaned: 1 });
    expect((await get(streamId)).status).toBe('ended');
  });

  it('refresh-prices refreshes live tokens and writes the quote to the token row', async () => {
    await goLive();
    ctx.prices.quotes.set(TEST_EVM_TOKEN, quote('3.21', { marketCapUsd: 777 }));
    const res = await refreshPrices(ctx.deps);
    expect(res.updated).toBeGreaterThanOrEqual(1);
    const [t] = await ctx.db.select().from(tokens).where(eq(tokens.contract, TEST_EVM_TOKEN));
    expect(t).toMatchObject({ priceUsd: '3.21', marketCapUsd: '777' });
  });

  it('frame-check makes the newest snapshot the thumbnail', async () => {
    const { streamId } = await goLive();
    const img = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#406080' } })
      .jpeg()
      .toBuffer();
    ctx.snapshots.add(streamId, 'img_20261001T120000.jpeg', new Uint8Array(img));
    const newest = ctx.snapshots.add(streamId, 'img_20261001T120100.jpeg', new Uint8Array(img));
    await frameCheck(ctx.deps);
    expect((await get(streamId)).thumbnailUrl).toBe(`https://cdn.test/${newest}`);
  });
});
