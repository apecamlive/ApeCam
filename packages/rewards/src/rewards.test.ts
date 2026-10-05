import { describe, expect, it } from 'vitest';
import { computeDailyReward, fromRaw, nextTier, scaleBatchProRata, toRaw, type RewardConfig } from './index';

const cfg: RewardConfig = {
  tiers: [
    [10, 1000],
    [30, 2000],
    [60, 3500],
    [100, 5000],
  ],
  dailyCap: 5000,
};
const whole = (raw: bigint) => Number(raw / 10n ** 18n);

describe('Stream to Earn rewards', () => {
  it('T-S3-U1 · tiers are cumulative per day (D2/D3)', () => {
    const cases: [number, number][] = [
      [0, 0],
      [9, 0],
      [10, 1000],
      [29, 1000],
      [30, 2000],
      [59, 2000],
      [60, 3500],
      [99, 3500],
      [100, 5000],
      [500, 5000],
    ];
    for (const [minutes, expected] of cases) expect(whole(computeDailyReward(minutes, cfg))).toBe(expected);
  });

  it('T-S3-U2 · two sessions the same day are added before tiering (40 + 25 = 65 → 3,500)', () => {
    expect(whole(computeDailyReward(40 + 25, cfg))).toBe(3500);
  });

  it('daily cap wins over a misconfigured higher tier', () => {
    expect(whole(computeDailyReward(200, { tiers: [...cfg.tiers, [150, 9000]], dailyCap: 5000 }))).toBe(5000);
  });

  it('next tier hint for the Studio', () => {
    expect(nextTier(0, cfg)).toEqual({ minutes: 10, total: 1000 });
    expect(nextTier(45, cfg)).toEqual({ minutes: 60, total: 3500 });
    expect(nextTier(100, cfg)).toBeNull();
  });

  it('T-S3-U5 · batch within 50% of the treasury is paid in full', () => {
    const amounts = [toRaw(5000), toRaw(1000)];
    expect(scaleBatchProRata(amounts, toRaw(20_000), 5000)).toEqual({ amounts, factor: 1 });
  });

  it('T-S3-U6 · treasury 1,000,000, batch 800,000 → factor 0.625, 5,000 → 3,125, never above 50%', () => {
    const amounts = [toRaw(5000), ...Array.from({ length: 159 }, () => toRaw(5000))]; // 160 × 5,000 = 800,000
    const { amounts: scaled, factor } = scaleBatchProRata(amounts, toRaw(1_000_000), 5000);
    expect(factor).toBe(0.625);
    expect(fromRaw(scaled[0]!)).toBe('3125');
    const total = scaled.reduce((a, b) => a + b, 0n);
    expect(total <= toRaw(500_000)).toBe(true);
    // Ratios between streamers are preserved.
    const mixed = scaleBatchProRata([toRaw(4000), toRaw(1000)], toRaw(2000), 5000).amounts;
    expect(mixed[0]! / mixed[1]!).toBe(4n);
  });

  it('T-S3-U7 · empty treasury → everything scales to 0, no error', () => {
    expect(scaleBatchProRata([toRaw(5000)], 0n, 5000).amounts).toEqual([0n]);
  });

  it('T-S3-U8 · 18-decimal conversion is exact', () => {
    expect(toRaw(5000)).toBe(5000n * 10n ** 18n);
    expect(fromRaw(3125n * 10n ** 18n + 5n * 10n ** 17n)).toBe('3125.5');
    expect(() => toRaw(1.5)).toThrow();
  });
});
