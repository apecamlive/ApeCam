import { chatMessages, streamMinutes, streams, tokens, users, wallets } from '@apecam/db';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';

export type FeedTab = 'live' | 'trending' | 'new';

export interface FeedItem {
  streamId: string;
  title: string;
  thumbnailUrl: string | null;
  startedAt: string | null;
  viewers: number;
  token: {
    chain: string;
    contract: string;
    ticker: string | null;
    name: string | null;
    logoUrl: string | null;
    marketCapUsd: string | null;
  };
  streamer: { userId: string; displayName: string | null; address: string };
  trendingScore?: number;
}

/**
 * Trending = growth over the last 15 minutes (Dev Brief): viewer gain + chat activity.
 * Until per-minute viewer history exists (count-minutes, Sprint 3) the baseline is 0,
 * so a stream younger than 15 minutes counts all its viewers as growth.
 */
export function trendingScore(input: { viewersNow: number; viewers15mAgo: number; chat15m: number }) {
  return Math.max(0, input.viewersNow - input.viewers15mAgo) * 2 + input.chat15m;
}

const PAGE_SIZE = 24;
const CACHE_SEC = 10;

/** Home feed. Hidden tokens and blurred streams never appear; no chain/launchpad labels are returned. */
export async function getFeed(deps: CoreDeps, tab: FeedTab, cursor = 0) {
  const cacheKey = `feed:${tab}:${cursor}`;
  const cached = await deps.kv.get(cacheKey);
  if (cached) return JSON.parse(cached) as { items: FeedItem[]; nextCursor: number | null };

  const rows = await deps.db
    .select({ stream: streams, token: tokens, user: users, wallet: wallets })
    .from(streams)
    .innerJoin(tokens, eq(tokens.id, streams.tokenId))
    .innerJoin(users, eq(users.id, streams.userId))
    .innerJoin(wallets, eq(wallets.id, streams.walletId))
    .where(and(eq(streams.status, 'live'), eq(streams.blurred, false), eq(tokens.hidden, false)));

  let items: FeedItem[] = rows.map(({ stream, token, user, wallet }) => ({
    streamId: stream.id,
    title: stream.title,
    thumbnailUrl: stream.thumbnailUrl,
    startedAt: stream.startedAt?.toISOString() ?? null,
    viewers: stream.currentViewers,
    token: {
      chain: token.chain,
      contract: token.contract,
      ticker: token.ticker,
      name: token.name,
      logoUrl: token.logoUrl,
      marketCapUsd: token.marketCapUsd,
    },
    streamer: { userId: user.id, displayName: user.displayName, address: wallet.address },
  }));

  if (tab === 'live') items.sort((a, b) => b.viewers - a.viewers);
  if (tab === 'new') items.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  if (tab === 'trending') items = await withTrending(deps, items);

  const page = items.slice(cursor, cursor + PAGE_SIZE);
  const result = { items: page, nextCursor: cursor + PAGE_SIZE < items.length ? cursor + PAGE_SIZE : null };
  await deps.kv.set(cacheKey, JSON.stringify(result), CACHE_SEC);
  return result;
}

async function withTrending(deps: CoreDeps, items: FeedItem[]) {
  if (!items.length) return items;
  const since = new Date((deps.now?.() ?? new Date()).getTime() - 15 * 60_000);
  const ids = items.map((i) => i.streamId);
  const chat = await deps.db
    .select({ streamId: chatMessages.streamId, n: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(and(inArray(chatMessages.streamId, ids), gte(chatMessages.createdAt, since)))
    .groupBy(chatMessages.streamId);
  const past = await deps.db
    .select({ streamId: streamMinutes.streamId, viewers: sql<number>`min(${streamMinutes.viewers})::int` })
    .from(streamMinutes)
    .where(
      and(
        inArray(streamMinutes.streamId, ids),
        gte(streamMinutes.minuteAt, since),
        sql`${streamMinutes.minuteAt} < ${new Date(since.getTime() + 60_000)}`,
      ),
    )
    .groupBy(streamMinutes.streamId);
  const chatBy = new Map(chat.map((c) => [c.streamId, c.n]));
  const pastBy = new Map(past.map((p) => [p.streamId, p.viewers]));
  return items
    .map((i) => ({
      ...i,
      trendingScore: trendingScore({
        viewersNow: i.viewers,
        viewers15mAgo: pastBy.get(i.streamId) ?? 0,
        chat15m: chatBy.get(i.streamId) ?? 0,
      }),
    }))
    .sort((a, b) => b.trendingScore! - a.trendingScore!);
}
