import { dismissReports } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const streamId = z.uuid().parse((await ctx.params).streamId);
  const { reason } = await parseBody(req, z.object({ reason: z.string().max(500).optional() }));
  return dismissReports(deps, staff.userId, streamId, reason);
});
