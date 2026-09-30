import { holdingChecks, streams, wallets } from '@apecam/db';
import { ApiError } from '@apecam/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { lastMinute, todayProgress } from './stream-to-earn';
import { getStream } from './streams';

/** Live panel data for the streamer (S2-2): viewers, last holding re-check, pending cut warning. */
export async function getStreamStatus(deps: CoreDeps, args: { userId: string; streamId: string }) {
  const stream = await getStream(deps, args.streamId);
  if (stream.userId !== args.userId) throw new ApiError(403, 'FORBIDDEN', 'Only the streamer can see this');
  const [last] = await deps.db
    .select()
    .from(holdingChecks)
    .where(eq(holdingChecks.streamId, stream.id))
    .orderBy(desc(holdingChecks.checkedAt))
    .limit(1);
  return {
    status: stream.status,
    endReason: stream.endReason,
    viewers: stream.currentViewers,
    peakViewers: stream.peakViewers,
    startedAt: stream.startedAt,
    blurred: stream.blurred,
    warningUntil: stream.warningUntil,
    lastCheck: last ? { passed: last.passed, usdValue: last.usdValue, checkedAt: last.checkedAt } : null,
    earn: { ...(await todayProgress(deps, args.userId)), lastMinute: await lastMinute(deps, stream.id) },
  };
}

/** Which of the user's wallets are live right now (D15: the Studio disables those in the picker). */
export async function liveStreamsByWallet(deps: CoreDeps, userId: string) {
  const rows = await deps.db
    .select({ walletId: streams.walletId, streamId: streams.id })
    .from(streams)
    .innerJoin(wallets, eq(wallets.id, streams.walletId))
    .where(and(eq(streams.userId, userId), inArray(streams.status, ['starting', 'live'])));
  return new Map(rows.map((r) => [r.walletId, r.streamId]));
}
