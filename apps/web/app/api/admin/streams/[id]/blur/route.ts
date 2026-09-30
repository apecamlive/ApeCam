import { setBlur } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const streamId = z.uuid().parse((await ctx.params).id);
  const body = await parseBody(req, z.object({ on: z.boolean(), reason: z.string().max(500).optional() }));
  return setBlur(deps, staff.userId, streamId, body.on, body.reason);
});
