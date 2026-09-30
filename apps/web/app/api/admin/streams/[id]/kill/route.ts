import { killStream } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const streamId = z.uuid().parse((await ctx.params).id);
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(1).max(500) }));
  return killStream(deps, staff.userId, streamId, reason);
});
