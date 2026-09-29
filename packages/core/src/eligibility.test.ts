import { APP_CONFIG_DEFAULTS } from '@apecam/shared';
import { describe, expect, it } from 'vitest';
import { evaluateEligibility, type EligibilityInput } from './eligibility';
import { quote } from './testing';

const base: EligibilityInput = {
  tokenHidden: false,
  userBanned: false,
  walletOwned: true,
  walletAlreadyLive: false,
  holding: { contract: '0xt', rawBalance: 150n * 10n ** 18n, decimals: 18 },
  quote: quote('1'),
  config: APP_CONFIG_DEFAULTS,
};

describe('T-P0-U5 · evaluateEligibility', () => {
  it('passes with $150 of a liquid token', () => {
    expect(evaluateEligibility(base)).toEqual({
      passed: true,
      reasons: [],
      usdValue: '150.00',
      minUsd: 100,
      shortfallUsd: null,
    });
  });

  it('INSUFFICIENT_HOLDING reports the shortfall', () => {
    const r = evaluateEligibility({
      ...base,
      holding: { ...(base.holding as object), rawBalance: 6025n * 10n ** 16n } as never,
    });
    expect(r).toMatchObject({
      passed: false,
      reasons: ['INSUFFICIENT_HOLDING'],
      usdValue: '60.25',
      shortfallUsd: '39.75',
    });
  });

  it('exactly $100 passes (minimum is inclusive)', () => {
    const r = evaluateEligibility({
      ...base,
      holding: { contract: '0xt', rawBalance: 100n * 10n ** 18n, decimals: 18 },
    });
    expect(r.passed).toBe(true);
  });

  it.each([
    ['USER_BANNED', { userBanned: true }],
    ['WALLET_NOT_OWNED', { walletOwned: false }],
    ['TOKEN_HIDDEN', { tokenHidden: true }],
    ['WALLET_ALREADY_LIVE', { walletAlreadyLive: true }],
    ['RPC_UNAVAILABLE', { holding: 'rpc_error' }],
    ['PRICE_UNAVAILABLE', { quote: null }],
    ['LOW_LIQUIDITY', { quote: quote('1', { liquidityUsd: 1000 }) }],
  ] as const)('%s', (code, over) => {
    const r = evaluateEligibility({ ...base, ...(over as Partial<EligibilityInput>) });
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain(code);
  });

  it('D20 · bonding-curve token with enough mcap and volume passes', () => {
    const r = evaluateEligibility({
      ...base,
      quote: quote('1', { liquidityUsd: null, marketCapUsd: 20_000, volume24hUsd: 5000 }),
    });
    expect(r.passed).toBe(true);
  });

  it('reports every failing rule, not only the first', () => {
    const r = evaluateEligibility({ ...base, userBanned: true, tokenHidden: true, quote: null });
    expect(r.reasons).toEqual(['USER_BANNED', 'TOKEN_HIDDEN', 'PRICE_UNAVAILABLE']);
  });
});
