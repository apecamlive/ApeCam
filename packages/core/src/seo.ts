import { streams, tokens, users, wallets } from '@apecam/db';
import { and, desc, eq, gte, inArray, isNotNull, max, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';

/**
 * Read-only lookups for page metadata, OG images and the sitemap (S4-4). They only read the database,
 * never call price APIs or RPCs, so crawlers cannot trigger external requests.
 */

export async function tokenSeo(deps: CoreDeps, chain: string, contract: string) {
  const [token] = await deps.db
    .select({
      id: tokens.id,
      ticker: tokens.ticker,
      name: tokens.name,
      logoUrl: tokens.logoUrl,
      hidden: tokens.hidden,
    })
    .from(tokens)
    .where(and(eq(tokens.chain, chain), inArray(tokens.contract, [contract, contract.toLowerCase()])));
  if (!token || token.hidden) return null;
  const [live] = (await deps.db
    .select({
      streams: sql<number>`count(*)::int`,
      viewers: sql<number>`coalesce(sum(${streams.currentViewers}), 0)::int`,
    })
    .from(streams)
    .where(and(eq(streams.tokenId, token.id), eq(streams.status, 'live')))) as [
    { streams: number; viewers: number },
  ];
  return { ticker: token.ticker, name: token.name, logoUrl: token.logoUrl, live };
}

export async function profileSeo(deps: CoreDeps, address: string) {
  const [row] = await deps.db
    .select({
      userId: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      address: wallets.address,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(inArray(wallets.address, [address, address.toLowerCase()]));
  if (!row) return null;
  const [live] = await deps.db
    .select({ title: streams.title })
    .from(streams)
    .where(and(eq(streams.userId, row.userId), eq(streams.status, 'live')))
    .limit(1);
  return {
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    address: row.address,
    liveTitle: live?.title ?? null,
  };
}

/** Token rooms that had a stream in the last `days` days, most recent first. */
export async function sitemapTokens(deps: CoreDeps, days = 30, limit = 5000) {
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const lastStream = max(streams.startedAt);
  return deps.db
    .select({ chain: tokens.chain, contract: tokens.contract, lastStreamAt: lastStream })
    .from(tokens)
    .innerJoin(streams, eq(streams.tokenId, tokens.id))
    .where(and(eq(tokens.hidden, false), isNotNull(streams.startedAt), gte(streams.startedAt, since)))
    .groupBy(tokens.chain, tokens.contract)
    .orderBy(desc(lastStream))
    .limit(limit);
}
