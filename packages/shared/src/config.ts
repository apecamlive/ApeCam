/**
 * Runtime-tunable settings, stored in the `app_config` table (Implementation Plan §5).
 * These defaults apply when a key is missing. Decisions: ✅ locked by owner, 🟡 plan default.
 */
export const APP_CONFIG_DEFAULTS = {
  'go_live.min_usd': 100, // brief
  'go_live.min_liquidity_usd': 5000, // 🟡 D10
  'go_live.bonding_curve_min_mcap_usd': 10_000, // 🟡 D20 (ADR 002), pending owner
  'go_live.bonding_curve_min_volume24h_usd': 1000, // 🟡 D20 (ADR 002), pending owner
  'go_live.recheck_interval_sec': 300,
  'go_live.cut_warning_sec': 60,
  'go_live.rpc_failures_before_cut': 3,
  'go_live.no_video_end_sec': 600, // 🟡 D16
  's2e.period': 'day_utc', // ✅ D1
  's2e.tiers': [
    [10, 1000],
    [30, 2000],
    [60, 3500],
    [100, 5000],
  ] as [number, number][], // ✅ D2, D3 (cumulative)
  's2e.daily_cap': 5000, // ✅ D3
  's2e.min_viewers': 3, // ✅ D5
  's2e.min_viewer_wallet_age_hours': 24,
  's2e.payout_cadence': 'weekly_monday', // ✅ D4
  's2e.treasury_scale_threshold': 0.5, // ✅ D6 (pro-rata, no pause)
  'mod.autoblur_reports': 3, // 🟡 D9
  'mod.autoblur_window_sec': 300, // 🟡 D9
  'chat.max_len': 200,
  'chat.min_interval_ms': 2000,
};

export type AppConfig = typeof APP_CONFIG_DEFAULTS;
export type AppConfigKey = keyof AppConfig;
