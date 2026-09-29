import { CHAINS, TokenNotFoundError, normalizeAddress, type ChainId } from '@apecam/chain';
import { tokens } from '@apecam/db';
import type { TokenQuote } from '@apecam/pricing';
import { ApiError } from '@apecam/shared';
import { and, eq } from 'drizzle-orm';
import type { CoreDeps } from './deps';

export type TokenRow = typeof tokens.$inferSelect;

/** Metadata older than this is refreshed on the next lookup. Prices are refreshed by the worker. */
const META_TTL_MS = 24 * 60 * 60 * 1000;

export function tokenLinks(chain: ChainId, contract: string, quote: TokenQuote | null) {
  const chartUrl = `https://dexscreener.com/${CHAINS[chain].dexscreener}/${contract}`;
  // Buy on the launchpad when we can tell which one; otherwise the best DEX pair.
  let buyUrl = quote?.pairUrl ?? chartUrl;
  if (quote?.dexId === 'pumpfun' || quote?.dexId === 'pumpswap') buyUrl = `https://pump.fun/coin/${contract}`;
  return { chartUrl, buyUrl };
}

/**
 * Logo fallback order from the Dev Brief: DexScreener → launchpad/on-chain metadata → placeholder.
 * The placeholder itself is rendered by the UI (ticker initials), so we store no URL for it.
 */
export async function resolveLogo(
  quote: TokenQuote | null,
  metadataUri: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ logoUrl: string | null; logoSource: TokenRow['logoSource'] }> {
  if (quote?.imageUrl) return { logoUrl: quote.imageUrl, logoSource: 'dexscreener' };
  if (metadataUri) {
    try {
      const res = await fetchImpl(metadataUri, { signal: AbortSignal.timeout(3000) });
      const json = (await res.json()) as { image?: unknown };
      if (typeof json.image === 'string' && /^https?:\/\//.test(json.image)) {
        // pump.fun and other launchpads host their metadata JSON on IPFS gateways.
        const source = /pump\.fun|ipfs/.test(metadataUri) ? 'launchpad' : 'onchain';
        return { logoUrl: json.image, logoSource: source };
      }
    } catch {
      // Metadata host down or not JSON: fall through to placeholder.
    }
  }
  return { logoUrl: null, logoSource: 'placeholder' };
}

/** Finds the token row, creating or refreshing it from chain metadata + DexScreener. */
export async function ensureToken(
  deps: Pick<CoreDeps, 'db' | 'chains' | 'prices' | 'now'>,
  chain: ChainId,
  rawContract: string,
  opts: { fetch?: typeof fetch } = {},
): Promise<TokenRow> {
  const adapter = deps.chains.get(chain);
  if (!adapter.isValidAddress(rawContract))
    throw new ApiError(400, 'INVALID_ADDRESS', 'Invalid contract address');
  const contract = normalizeAddress(adapter.family, rawContract);
  const now = deps.now?.() ?? new Date();

  const [existing] = await deps.db
    .select()
    .from(tokens)
    .where(and(eq(tokens.chain, chain), eq(tokens.contract, contract)));
  if (existing && now.getTime() - existing.updatedAt.getTime() < META_TTL_MS && existing.decimals !== null) {
    return existing;
  }

  let meta;
  try {
    meta = await adapter.getTokenMeta(contract);
  } catch (err) {
    if (err instanceof TokenNotFoundError)
      throw new ApiError(404, 'TOKEN_NOT_FOUND', 'Not a token on this chain');
    throw new ApiError(503, 'RPC_UNAVAILABLE', 'Chain RPC unavailable, try again');
  }
  const quote = await deps.prices.getQuote(CHAINS[chain].dexscreener, contract).catch(() => null);
  const logo = await resolveLogo(quote, meta.metadataUri, opts.fetch);
  const values = {
    chain,
    contract,
    ticker: quote?.ticker ?? meta.ticker ?? null,
    name: quote?.name ?? meta.name ?? null,
    decimals: meta.decimals,
    ...logo,
    ...quoteColumns(quote, now),
    ...tokenLinks(chain, contract, quote),
    updatedAt: now,
  };
  const [row] = await deps.db
    .insert(tokens)
    .values(values)
    .onConflictDoUpdate({ target: [tokens.chain, tokens.contract], set: values })
    .returning();
  return row!;
}

export function quoteColumns(quote: TokenQuote | null, now: Date) {
  if (!quote) return {};
  return {
    priceUsd: quote.priceUsd,
    marketCapUsd: quote.marketCapUsd?.toString() ?? null,
    liquidityUsd: quote.liquidityUsd?.toString() ?? null,
    volume24hUsd: quote.volume24hUsd.toString(),
    change24h: quote.change24h?.toString() ?? null,
    priceUpdatedAt: now,
  };
}
