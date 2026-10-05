import { getStreamStatus } from '@apecam/core';
import { z } from 'zod';
import { requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Streamer's live panel: viewers, last holding re-check, pending cut warning (S2-2). */
export const GET = route(async (req, ctx, deps) => {
  const session = await requireSession(req, deps);
  const streamId = z.uuid().parse((await ctx.params).id);
  return getStreamStatus(deps, { userId: session.userId, streamId });
});
