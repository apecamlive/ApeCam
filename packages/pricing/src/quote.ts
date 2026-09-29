import Decimal from 'decimal.js';
import type { DexPair } from './dexscreener';

export interface TokenQuote {
  priceUsd: string;
  marketCapUsd: number | null;
  /** null for bonding-curve pairs (pump.fun before graduation has no liquidity field, ADR 002). */
  liquidityUsd: number | null;
  volume24hUsd: number;
  change24h: number | null;
  dexId: string;
  pairUrl: string;
  name: string;
  ticker: string;
  imageUrl: string | null;
}

const sameAddress = (a: string, b: string) => a === b || a.toLowerCase() === b.toLowerCase();

/**
 * Picks the pair that best represents the token price:
 * highest USD liquidity; when no pair reports liquidity (bonding curve), highest 24h volume.
 */
export function pickBestPair(pairs: DexPair[], tokenAddress: string): DexPair | undefined {
  const candidates = pairs.filter((p) => sameAddress(p.baseToken.address, tokenAddress) && p.priceUsd);
  const withLiquidity = candidates.filter((p) => p.liquidity?.usd !== undefined);
  const pool = withLiquidity.length ? withLiquidity : candidates;
  const score = (p: DexPair) => (withLiquidity.length ? (p.liquidity?.usd ?? 0) : (p.volume?.h24 ?? 0));
  return pool.reduce<DexPair | undefined>(
    (best, p) => (!best || score(p) > score(best) ? p : best),
    undefined,
  );
}

export function toQuote(pair: DexPair): TokenQuote {
  return {
    priceUsd: pair.priceUsd!,
    marketCapUsd: pair.marketCap ?? pair.fdv ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? 0,
    change24h: pair.priceChange?.h24 ?? null,
    dexId: pair.dexId,
    pairUrl: pair.url,
    name: pair.baseToken.name,
    ticker: pair.baseToken.symbol,
    imageUrl: pair.info?.imageUrl ?? null,
  };
}

/** USD value of a raw on-chain balance. Exact decimal math: no float rounding on tiny prices. */
export function holdingUsdValue(rawBalance: bigint, decimals: number, priceUsd: string): Decimal {
  return new Decimal(rawBalance.toString()).div(new Decimal(10).pow(decimals)).mul(priceUsd);
}

export interface MarketGuardConfig {
  minLiquidityUsd: number;
  bondingCurveMinMcapUsd: number;
  bondingCurveMinVolume24hUsd: number;
}

/**
 * D10 + proposed D20: tokens that are too thin to price reliably cannot be streamed,
 * because a tiny pool makes the $100 minimum easy to fake.
 */
export function passesMarketGuard(quote: TokenQuote, cfg: MarketGuardConfig): boolean {
  if (quote.liquidityUsd !== null) return quote.liquidityUsd >= cfg.minLiquidityUsd;
  return (
    (quote.marketCapUsd ?? 0) >= cfg.bondingCurveMinMcapUsd &&
    quote.volume24hUsd >= cfg.bondingCurveMinVolume24hUsd
  );
}
