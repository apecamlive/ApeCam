import { revokeInvite } from '@apecam/core';
import { z } from 'zod';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const address = z
    .string()
    .min(20)
    .max(64)
    .parse((await ctx.params).address);
  return revokeInvite(deps, staff.userId, address);
});
