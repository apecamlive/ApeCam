import { recheckHoldings, refreshPrices, refreshThumbnails, sweepStreams, type CoreDeps } from '@apecam/core';

export interface JobDefinition {
  name: string;
  everyMs: number;
  run: (deps: CoreDeps) => Promise<unknown>;
}

/** Scheduled jobs (Implementation Plan §7). New jobs are added here as sprints deliver them. */
export const JOBS: JobDefinition[] = [
  // Cut the Cam: each live stream is re-checked every 5 min, and every tick while it is in the 60s warning.
  { name: 'recheck-holdings', everyMs: 30_000, run: recheckHoldings },
  { name: 'refresh-prices', everyMs: 60_000, run: refreshPrices },
  { name: 'stale-streams', everyMs: 60_000, run: sweepStreams },
  { name: 'refresh-thumbnails', everyMs: 60_000, run: refreshThumbnails },
];
