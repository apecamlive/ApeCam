import { setPayoutWallet } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Make this wallet the Stream to Earn payout wallet (EVM only, D7). */
export const PATCH = route(async (req, ctx, deps) => {
  const session = await requireSession(req, deps);
  const walletId = z.uuid().parse((await ctx.params).id);
  await parseBody(req, z.object({ payout: z.literal(true) }));
  return setPayoutWallet(deps, { userId: session.userId, walletId });
});
