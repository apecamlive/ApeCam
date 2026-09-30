import { readGoLiveAccess } from '@apecam/core';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Public, non-secret settings the UI needs everywhere: Go Live mode (beta banner) and the feedback link. */
export const GET = route(async (_req, _ctx, deps) => {
  const config = await deps.config();
  return { goLiveAccess: await readGoLiveAccess(deps), feedbackUrl: config['beta.feedback_url'] || null };
});
