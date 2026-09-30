import { banWallet } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  until: z.union([z.literal('permanent'), z.iso.datetime()]),
  reason: z.string().trim().min(1).max(500),
});

/** Ban the user behind this wallet: every linked wallet, live streams ended, sessions invalidated. */
export const POST = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const address = z
    .string()
    .min(20)
    .max(64)
    .parse((await ctx.params).address);
  const body = await parseBody(req, Body);
  return banWallet(
    deps,
    staff.userId,
    address,
    body.until === 'permanent' ? 'permanent' : new Date(body.until),
    body.reason,
  );
});
