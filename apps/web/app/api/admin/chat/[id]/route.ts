import { deleteChatMessage } from '@apecam/core';
import { z } from 'zod';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const id = z.coerce
    .number()
    .int()
    .positive()
    .parse((await ctx.params).id);
  return deleteChatMessage(deps, staff.userId, id);
});
