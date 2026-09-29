import { MemoryKeyValueStore } from '@apecam/shared';
import { describe, expect, it, vi } from 'vitest';
import { DexScreenerClient, type DexPair } from './dexscreener';
import { holdingUsdValue, passesMarketGuard, pickBestPair, toQuote } from './quote';
import { PriceService } from './service';

const TOKEN = '0xabc0000000000000000000000000000000000001';

function pair(over: Partial<DexPair> & { dexId: string }): DexPair {
  return {
    chainId: 'base',
    url: `https://dexscreener.com/base/${over.dexId}`,
    pairAddress: `0x${over.dexId}`,
    baseToken: { address: TOKEN, name: 'Ape', symbol: 'APE' },
    quoteToken: { address: '0xweth', symbol: 'WETH' },
    priceUsd: '0.5',
    ...over,
  };
}

const guard = { minLiquidityUsd: 5000, bondingCurveMinMcapUsd: 10_000, bondingCurveMinVolume24hUsd: 1000 };

describe('holdingUsdValue', () => {
  it('T-P0-U3 · exact for 6, 9, 18 decimals and tiny prices', () => {
    expect(holdingUsdValue(1_000_000n, 6, '1').toString()).toBe('1');
    expect(holdingUsdValue(123_456_789_000n, 9, '0.81').toString()).toBe('99.99999909');
    expect(holdingUsdValue(10n ** 30n, 18, '0.000000001').toString()).toBe('1000');
    // 0.1 + 0.2 style float error must not appear.
    expect(holdingUsdValue(3n, 1, '0.1').toString()).toBe('0.03');
  });
});

describe('pickBestPair', () => {
  it('T-P0-U4 · picks the pair with the highest liquidity', () => {
    const best = pickBestPair(
      [
        pair({ dexId: 'a', liquidity: { usd: 1000 } }),
        pair({ dexId: 'b', liquidity: { usd: 90_000 } }),
        pair({ dexId: 'c', liquidity: { usd: 5000 } }),
      ],
      TOKEN,
    );
    expect(best?.dexId).toBe('b');
  });

  it('T-P0-U4 · bonding curve (no liquidity field) → highest 24h volume', () => {
    const best = pickBestPair(
      [pair({ dexId: 'pumpfun', volume: { h24: 50 } }), pair({ dexId: 'pumpfun2', volume: { h24: 900 } })],
      TOKEN,
    );
    expect(best?.dexId).toBe('pumpfun2');
  });

  it('ignores pairs where the token is the quote side and pairs without a price', () => {
    const other = pair({
      dexId: 'x',
      liquidity: { usd: 1e9 },
      baseToken: { address: '0xother', name: 'O', symbol: 'O' },
    });
    const noPrice = pair({ dexId: 'y', liquidity: { usd: 1e8 }, priceUsd: undefined });
    const ok = pair({ dexId: 'z', liquidity: { usd: 10 } });
    expect(pickBestPair([other, noPrice, ok], TOKEN)?.dexId).toBe('z');
  });

  it('matches EVM addresses case-insensitively', () => {
    expect(
      pickBestPair([pair({ dexId: 'a', liquidity: { usd: 1 } })], TOKEN.toUpperCase().replace('0X', '0x')),
    ).toBeDefined();
  });
});

describe('passesMarketGuard', () => {
  it('D10 · liquidity ≥ $5,000 passes, below fails', () => {
    expect(passesMarketGuard(toQuote(pair({ dexId: 'a', liquidity: { usd: 5000 } })), guard)).toBe(true);
    expect(passesMarketGuard(toQuote(pair({ dexId: 'a', liquidity: { usd: 4999 } })), guard)).toBe(false);
  });

  it('D20 · bonding curve needs mcap ≥ $10k AND volume ≥ $1k', () => {
    const q = (marketCap: number, h24: number) =>
      toQuote(pair({ dexId: 'pumpfun', marketCap, volume: { h24 } }));
    expect(passesMarketGuard(q(12_000, 5000), guard)).toBe(true);
    expect(passesMarketGuard(q(9_000, 5000), guard)).toBe(false);
    expect(passesMarketGuard(q(12_000, 500), guard)).toBe(false);
  });
});

describe('DexScreenerClient', () => {
  it('T-S1-U6 · 75 addresses → 3 requests (30 + 30 + 15)', async () => {
    const fetchMock = vi.fn(async () => new Response('[]'));
    const client = new DexScreenerClient({ fetch: fetchMock });
    const addrs = Array.from({ length: 75 }, (_, i) => `0x${i.toString(16).padStart(40, '0')}`);

    await client.getPairs('base', addrs);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      (c) => (c as unknown as [string])[0].split('/').at(-1)!.split(',').length,
    );
    expect(sizes).toEqual([30, 30, 15]);
  });

  it('HTTP error → PRICE_UNAVAILABLE', async () => {
    const client = new DexScreenerClient({ fetch: vi.fn(async () => new Response('', { status: 503 })) });
    await expect(client.getPairs('base', [TOKEN])).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE' });
  });
});

describe('PriceService', () => {
  it('caches quotes, including "no price", for the TTL', async () => {
    const getPairs = vi.fn(async () => [pair({ dexId: 'a', liquidity: { usd: 9000 } })]);
    const service = new PriceService(new MemoryKeyValueStore(), { getPairs } as unknown as DexScreenerClient);

    const first = await service.getQuotes('base', [TOKEN, '0xnone']);
    const second = await service.getQuotes('base', [TOKEN, '0xnone']);

    expect(first.get(TOKEN)?.priceUsd).toBe('0.5');
    expect(first.get('0xnone')).toBeNull();
    expect(second.get('0xnone')).toBeNull();
    expect(getPairs).toHaveBeenCalledTimes(1);
  });
});
