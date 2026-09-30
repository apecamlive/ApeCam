import { myRewards } from '@apecam/core';
import { requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Own Stream to Earn rewards: earned / pending / paid and history (S3-3). */
export const GET = route(async (req, _ctx, deps) => {
  const session = await requireSession(req, deps);
  return myRewards(deps, session.userId);
});
