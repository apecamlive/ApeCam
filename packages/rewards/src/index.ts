/**
 * Stream to Earn reward math (Implementation Plan §8). Pure functions, no I/O.
 * All $APECAM amounts are raw integers with 18 decimals.
 */

export const APECAM_DECIMALS = 18;
const ONE = 10n ** BigInt(APECAM_DECIMALS);

export interface RewardConfig {
  /** [minutes, cumulative total for the day] — D2/D3: [[10,1000],[30,2000],[60,3500],[100,5000]]. */
  tiers: [number, number][];
  /** D3: 5,000 per user per UTC day. */
  dailyCap: number;
}

/** Whole $APECAM → raw 18-decimal units. */
export function toRaw(whole: number): bigint {
  if (!Number.isInteger(whole) || whole < 0)
    throw new Error(`reward must be a non-negative integer, got ${whole}`);
  return BigInt(whole) * ONE;
}

/** Raw → display string with up to `digits` decimals ("3125", "3125.5"). */
export function fromRaw(raw: bigint, digits = 4): string {
  const whole = raw / ONE;
  const frac = (raw % ONE).toString().padStart(APECAM_DECIMALS, '0').slice(0, digits).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Highest tier reached (tiers are cumulative totals, not increments), capped per day. */
export function computeDailyReward(validMinutes: number, cfg: RewardConfig): bigint {
  let amount = 0;
  for (const [minutes, total] of [...cfg.tiers].sort((a, b) => a[0] - b[0])) {
    if (validMinutes >= minutes) amount = total;
  }
  return toRaw(Math.min(amount, cfg.dailyCap));
}

/** The next tier a streamer can reach today, for the Studio progress hint. */
export function nextTier(validMinutes: number, cfg: RewardConfig): { minutes: number; total: number } | null {
  const next = [...cfg.tiers]
    .sort((a, b) => a[0] - b[0])
    .find(([m, t]) => validMinutes < m && t <= cfg.dailyCap);
  return next ? { minutes: next[0], total: next[1] } : null;
}

/**
 * D6: pro-rata scaling of a weekly payout batch. When the batch total exceeds `threshold` of the treasury
 * balance, every reward is multiplied by the same factor so the batch pays exactly that share.
 * Integer math, rounded down, so the batch can never exceed the allowed amount.
 */
export function scaleBatchProRata(
  amounts: bigint[],
  treasuryBalance: bigint,
  thresholdBps: number,
): { amounts: bigint[]; factor: number } {
  const need = amounts.reduce((a, b) => a + b, 0n);
  const allowed = (treasuryBalance * BigInt(thresholdBps)) / 10_000n;
  if (need === 0n || need <= allowed) return { amounts, factor: 1 };
  return {
    amounts: amounts.map((a) => (a * allowed) / need),
    factor: Number((allowed * 1_000_000n) / need) / 1_000_000,
  };
}
