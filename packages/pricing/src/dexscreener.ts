/** DexScreener pair as returned by /tokens/v1 and /latest/dex/search (fields we use). */
export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string; websites?: { url: string }[] };
}

export const DEXSCREENER_BATCH_SIZE = 30;

export interface DexScreenerClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class DexScreenerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: DexScreenerClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://api.dexscreener.com';
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  /** All pairs for the given token addresses, batched 30 per request (ADR 002). */
  async getPairs(chainSlug: string, addresses: string[]): Promise<DexPair[]> {
    const unique = [...new Set(addresses)];
    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += DEXSCREENER_BATCH_SIZE) {
      batches.push(unique.slice(i, i + DEXSCREENER_BATCH_SIZE));
    }
    const results = await Promise.all(
      batches.map((batch) => this.get<DexPair[]>(`/tokens/v1/${chainSlug}/${batch.join(',')}`)),
    );
    return results.flat();
  }

  async search(query: string): Promise<DexPair[]> {
    const body = await this.get<{ pairs: DexPair[] | null }>(
      `/latest/dex/search?q=${encodeURIComponent(query)}`,
    );
    return body.pairs ?? [];
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new PriceUnavailableError(`DexScreener HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  }
}

export class PriceUnavailableError extends Error {
  readonly code = 'PRICE_UNAVAILABLE';
}
