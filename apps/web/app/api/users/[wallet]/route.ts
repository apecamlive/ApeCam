import { getPublicProfile } from '@apecam/core';
import { z } from 'zod';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Public wallet identity: stats, stream history, payouts (Dev Brief `/u/{wallet}`). */
export const GET = route(async (_req, ctx, deps) => {
  const wallet = z
    .string()
    .min(20)
    .max(64)
    .parse((await ctx.params).wallet);
  return getPublicProfile(deps, wallet);
});
