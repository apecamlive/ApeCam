import { batchCsv } from '@apecam/core';
import { z } from 'zod';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** `wallet,amount_raw,amount` for unpaid lines of a batch, for the owner's multisend tool. */
export const GET = route(async (req, ctx, deps) => {
  await requireStaff(req, deps, 'admin');
  const id = z.uuid().parse((await ctx.params).id);
  return new Response(await batchCsv(deps, id), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="apecam-payout-${id.slice(0, 8)}.csv"`,
    },
  });
});
