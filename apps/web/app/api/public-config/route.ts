import { readGoLiveAccess } from '@apecam/core';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Public, non-secret settings the UI needs everywhere: Go Live mode, feedback link, Stream to Earn tiers. */
export const GET = route(async (_req, _ctx, deps) => {
  const config = await deps.config();
  return {
    goLiveAccess: await readGoLiveAccess(deps),
    feedbackUrl: config['beta.feedback_url'] || null,
    s2e: {
      tiers: config['s2e.tiers'],
      dailyCap: config['s2e.daily_cap'],
      minViewers: config['s2e.min_viewers'],
    },
    goLiveMinUsd: config['go_live.min_usd'],
  };
});
