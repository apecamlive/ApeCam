import { unbanWallet } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const address = z
    .string()
    .min(20)
    .max(64)
    .parse((await ctx.params).address);
  const { reason } = await parseBody(req, z.object({ reason: z.string().max(500).optional() }));
  return unbanWallet(deps, staff.userId, address, reason);
});
