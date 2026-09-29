import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';
import { describe, expect, it } from 'vitest';
import { createChainAdapters } from '../../src';

// T-P0-C1 · contract test against real RPCs. Runs on a schedule, not on every PR.
// Local runs from Indonesia need DoH for *.robinhood.com (ADR 001): set APECAM_DOH=1.
if (process.env.APECAM_DOH === '1') {
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup(hostname, options, callback) {
          if (!/(^|\.)robinhood\.com$/.test(hostname)) return dns.lookup(hostname, options, callback);
          fetch(`https://1.1.1.1/dns-query?name=${hostname}&type=A`, {
            headers: { accept: 'application/dns-json' },
          })
            .then((r) => r.json() as Promise<{ Answer: { type: number; data: string }[] }>)
            .then((b) => {
              const ip = b.Answer.find((a) => a.type === 1)!.data;
              if (options.all) callback(null, [{ address: ip, family: 4 }]);
              else callback(null, ip, 4);
            }, callback);
        },
      },
    }),
  );
}

const adapters = createChainAdapters();

describe('T-P0-C1 · live chain reads', { timeout: 30_000 }, () => {
  it('solana · BONK (SPL Token) meta', async () => {
    const meta = await adapters.get('solana').getTokenMeta('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
    expect(meta.decimals).toBe(5);
  });

  it('solana · balance of a burn-ish address is a bigint, not an error', async () => {
    const bal = await adapters
      .get('solana')
      .getBalance('11111111111111111111111111111111', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
    expect(typeof bal.rawBalance).toBe('bigint');
  });

  it('robinhood · WETH-like token meta on chain 4663', async () => {
    // $ROBINHOOD token seen in spike S2 (DexScreener).
    const meta = await adapters.get('robinhood').getTokenMeta('0xb8fa8010833463aac5595b55b9045479239eff79');
    expect(meta.decimals).toBeGreaterThan(0);
  });

  it('base · USDC meta', async () => {
    const meta = await adapters.get('base').getTokenMeta('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(meta).toMatchObject({ decimals: 6, ticker: 'USDC' });
  });
});
