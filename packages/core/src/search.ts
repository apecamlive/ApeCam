import { CHAINS, CHAIN_IDS, type ChainId } from '@apecam/chain';
import { streams, tokens, users, wallets } from '@apecam/db';
import { ApiError } from '@apecam/shared';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { ensureToken, type TokenRow } from './tokens';

export interface SearchResult {
  chain: string;
  contract: string;
  ticker: string | null;
  name: string | null;
  logoUrl: string | null;
  marketCapUsd: string | null;
  live: number;
}

/** Chains whose address format matches the query (a 0x address could be on any EVM chain). */
function chainsForAddress(deps: Pick<CoreDeps, 'chains'>, q: string): ChainId[] {
  return CHAIN_IDS.filter((id) => deps.chains.get(id).isValidAddress(q));
}

/**
 * Search by ticker or contract address across chains (S1-11). Duplicate tickers are shown
 * neutrally, sorted by market cap. An unknown contract is looked up on-chain and stored.
 */
export async function searchTokens(
  deps: CoreDeps & { findPairsByAddress?: (q: string) => Promise<{ chainSlug: string }[]> },
  rawQuery: string,
): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  let rows: TokenRow[];
  const addressChains = chainsForAddress(deps, q);
  if (addressChains.length) {
    const lowered = q.startsWith('0x') ? q.toLowerCase() : q;
    rows = await deps.db
      .select()
      .from(tokens)
      .where(
        and(eq(tokens.contract, lowered), inArray(tokens.chain, addressChains), eq(tokens.hidden, false)),
      );
    if (!rows.length) rows = await lookupUnknownContract(deps, q, addressChains);
  } else {
    const term = q.replace(/^\$/, '');
    rows = await deps.db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.hidden, false),
          or(ilike(tokens.ticker, `${term.replace(/[%_]/g, '')}%`), sql`${tokens.ticker} % ${term}`),
        ),
      )
      .orderBy(desc(sql`coalesce(${tokens.marketCapUsd}, 0)`))
      .limit(20);
  }
  if (!rows.length) return [];

  const live = await deps.db
    .select({ tokenId: streams.tokenId, n: sql<number>`count(*)::int` })
    .from(streams)
    .where(
      and(
        inArray(
          streams.tokenId,
          rows.map((r) => r.id),
        ),
        eq(streams.status, 'live'),
      ),
    )
    .groupBy(streams.tokenId);
  const liveBy = new Map(live.map((l) => [l.tokenId, l.n]));
  return rows
    .map((r) => ({
      chain: r.chain,
      contract: r.contract,
      ticker: r.ticker,
      name: r.name,
      logoUrl: r.logoUrl,
      marketCapUsd: r.marketCapUsd,
      live: liveBy.get(r.id) ?? 0,
    }))
    .sort((a, b) => Number(b.marketCapUsd ?? 0) - Number(a.marketCapUsd ?? 0));
}

async function lookupUnknownContract(
  deps: CoreDeps & { findPairsByAddress?: (q: string) => Promise<{ chainSlug: string }[]> },
  q: string,
  candidates: ChainId[],
): Promise<TokenRow[]> {
  // Solana addresses are unambiguous; for 0x addresses ask DexScreener which chain(s) the token trades on.
  let chains = candidates;
  if (candidates.length > 1 && deps.findPairsByAddress) {
    const slugs = new Set((await deps.findPairsByAddress(q)).map((p) => p.chainSlug));
    chains = candidates.filter((id) => slugs.has(CHAINS[id].dexscreener));
  }
  const found: TokenRow[] = [];
  for (const chain of chains) {
    try {
      found.push(await ensureToken(deps, chain, q));
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'TOKEN_NOT_FOUND') throw err;
    }
  }
  return found.filter((t) => !t.hidden);
}

/** Token page data: metadata, price and every live stream for it (stream picker). */
export async function getTokenPage(deps: CoreDeps, chain: ChainId, contract: string) {
  const token = await ensureToken(deps, chain, contract);
  if (token.hidden) throw new ApiError(404, 'TOKEN_HIDDEN', 'This token is not available');
  const live = await deps.db
    .select({
      id: streams.id,
      title: streams.title,
      viewers: streams.currentViewers,
      startedAt: streams.startedAt,
      blurred: streams.blurred,
      source: streams.source,
      streamer: {
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        address: wallets.address,
      },
    })
    .from(streams)
    .innerJoin(users, eq(users.id, streams.userId))
    .innerJoin(wallets, eq(wallets.id, streams.walletId))
    .where(and(eq(streams.tokenId, token.id), eq(streams.status, 'live')))
    .orderBy(desc(streams.currentViewers));
  return { token, streams: live };
}
