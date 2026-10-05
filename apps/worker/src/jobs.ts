import {
  backupDatabase,
  closeRecentRewards,
  dailyOpsReport,
  countMinutes,
  frameCheck,
  monitorSystem,
  recheckHoldings,
  refreshPrices,
  sweepStreams,
  syncPayouts,
  syncTracker,
  type CoreDeps,
} from '@apecam/core';

export interface JobDefinition {
  name: string;
  /** Fixed interval… */
  everyMs?: number;
  /** …or a cron pattern, always evaluated in UTC. */
  cron?: string;
  run: (deps: CoreDeps) => Promise<unknown>;
}

/** Scheduled jobs (Implementation Plan §7). */
export const JOBS: JobDefinition[] = [
  // Cut the Cam: each live stream is re-checked every 5 min, and every tick while it is in the 60s warning.
  { name: 'recheck-holdings', everyMs: 30_000, run: recheckHoldings },
  { name: 'refresh-prices', everyMs: 60_000, run: refreshPrices },
  { name: 'stale-streams', everyMs: 60_000, run: sweepStreams },
  // Thumbnails + "video is actually live" for Stream to Earn (S3-2).
  { name: 'frame-check', everyMs: 60_000, run: frameCheck },
  { name: 'count-minutes', everyMs: 60_000, run: countMinutes },
  // D1: rewards close per UTC day, a few minutes after midnight so the last minutes are counted.
  { name: 'close-rewards', cron: '10 0 * * *', run: (deps) => closeRecentRewards(deps) },
  { name: 'sync-tracker', everyMs: 5 * 60_000, run: syncTracker },
  { name: 'sync-payouts', everyMs: 5 * 60_000, run: syncPayouts },
  // Logical backup to the private R2 bucket (S4-10), after the nightly reward close.
  { name: 'backup-db', cron: '30 2 * * *', run: backupDatabase },
  // Launch-week ops summary to the alert channel (L-8), after the nightly reward close.
  { name: 'daily-report', cron: '20 0 * * *', run: (deps) => dailyOpsReport(deps) },
  // Ops alerts: tracker lag (S4-9), reports open > 15 min (Sprint 5). Job failure streaks: runJob.
  { name: 'monitor', everyMs: 5 * 60_000, run: monitorSystem },
];
