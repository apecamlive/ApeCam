import { endStream } from '@apecam/core';
import { z } from 'zod';
import { requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, deps) => {
  const session = await requireSession(req, deps);
  const streamId = z.uuid().parse((await ctx.params).id);
  return endStream(deps, { userId: session.userId, streamId });
});
