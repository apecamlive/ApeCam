import type { KeyValueStore } from '@apecam/shared';
import { DexScreenerClient } from './dexscreener';
import { pickBestPair, toQuote, type TokenQuote } from './quote';

const NO_PRICE = '__none__';

/**
 * Cached token quotes (Redis, 60s TTL). A token without any priced pair is cached as "none"
 * for the same TTL so a missing token does not hammer DexScreener.
 */
export class PriceService {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly client = new DexScreenerClient(),
    private readonly ttlSec = 60,
  ) {}

  async getQuote(chainSlug: string, contract: string): Promise<TokenQuote | null> {
    const map = await this.getQuotes(chainSlug, [contract]);
    return map.get(contract) ?? null;
  }

  async getQuotes(chainSlug: string, contracts: string[]): Promise<Map<string, TokenQuote | null>> {
    const result = new Map<string, TokenQuote | null>();
    const missing: string[] = [];
    for (const contract of contracts) {
      const cached = await this.kv.get(key(chainSlug, contract));
      if (cached === null) missing.push(contract);
      else result.set(contract, cached === NO_PRICE ? null : (JSON.parse(cached) as TokenQuote));
    }
    if (missing.length) {
      for (const [contract, quote] of await this.refresh(chainSlug, missing)) result.set(contract, quote);
    }
    return result;
  }

  /** Fetches fresh quotes, bypassing the cache, and stores them. Used by the `refresh-prices` job. */
  async refresh(chainSlug: string, contracts: string[]): Promise<Map<string, TokenQuote | null>> {
    const result = new Map<string, TokenQuote | null>();
    const pairs = await this.client.getPairs(chainSlug, contracts);
    for (const contract of contracts) {
      const best = pickBestPair(pairs, contract);
      const quote = best ? toQuote(best) : null;
      result.set(contract, quote);
      await this.kv.set(key(chainSlug, contract), quote ? JSON.stringify(quote) : NO_PRICE, this.ttlSec);
    }
    return result;
  }
}

const key = (chain: string, contract: string) => `price:${chain}:${contract.toLowerCase()}`;
