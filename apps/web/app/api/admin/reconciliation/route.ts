import { matchTransfer, unmatchedTransfers } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Treasury transfers sync-payouts could not match automatically (S3-10). */
export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps, 'admin');
  return { transfers: await unmatchedTransfers(deps) };
});

/** Pair one transfer with the batch it pays. */
export const POST = route(async (req, _ctx, deps) => {
  const admin = await requireStaff(req, deps, 'admin');
  const body = await parseBody(
    req,
    z.object({ txHash: z.string().min(10), logIndex: z.number().int().min(0), batchId: z.uuid() }),
  );
  return matchTransfer(deps, admin.userId, body);
});
