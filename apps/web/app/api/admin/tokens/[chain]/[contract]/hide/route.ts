import { CHAIN_IDS } from '@apecam/chain';
import { setTokenHidden } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Params = z.object({ chain: z.enum(CHAIN_IDS), contract: z.string().min(20).max(64) });

export const POST = route(async (req, ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const { chain, contract } = Params.parse(await ctx.params);
  const body = await parseBody(
    req,
    z.object({ hidden: z.boolean(), reason: z.string().max(500).optional() }),
  );
  return setTokenHidden(deps, staff.userId, chain, contract, body.hidden, body.reason);
});
