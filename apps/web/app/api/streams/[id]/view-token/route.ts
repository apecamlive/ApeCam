import { viewerToken } from '@apecam/core';
import { z } from 'zod';
import { getSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Subscribe-only LiveKit token. Watching never requires a wallet (Dev Brief, viewer flow). */
export const POST = route(
  async (req, ctx, deps) => {
    const streamId = z.uuid().parse((await ctx.params).id);
    const session = await getSession(req, deps);
    return viewerToken(deps, { streamId, userId: session?.userId });
  },
  { rateLimit: LIMITS.viewToken },
);
