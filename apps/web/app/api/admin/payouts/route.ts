import { batchPayoutLines, createPayoutBatch, listBatches, listRewardsForAdmin } from '@apecam/core';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Payout batches with their per-wallet lines, plus rewards still pending (S3-10). Admin only. */
export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps, 'admin');
  const batches = await listBatches(deps);
  return {
    batches: await Promise.all(
      batches.map(async (b) => ({ ...b, lines: await batchPayoutLines(deps, b.id) })),
    ),
    pending: (await listRewardsForAdmin(deps, 'pending')).map((r) => ({
      ...r.reward,
      displayName: r.displayName,
    })),
  };
});

/** Create last week's batch (D4: Mondays). Scales pro-rata against the live treasury balance (D6). */
export const POST = route(async (req, _ctx, deps) => {
  const admin = await requireStaff(req, deps, 'admin');
  return createPayoutBatch(deps, admin.userId);
});
