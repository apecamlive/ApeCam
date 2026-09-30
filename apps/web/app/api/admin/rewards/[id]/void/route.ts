import { voidReward } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, deps) => {
  const admin = await requireStaff(req, deps, 'admin');
  const id = z.uuid().parse((await ctx.params).id);
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(1).max(500) }));
  return voidReward(deps, admin.userId, id, reason);
});
