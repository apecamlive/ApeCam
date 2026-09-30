import { modActions, payoutBatches, rewards, treasuryTransfers, users, wallets } from '@apecam/db';
import { fromRaw, scaleBatchProRata } from '@apecam/rewards';
import { ApiError } from '@apecam/shared';
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The previous Monday–Sunday (UTC) relative to `now` (D4: paid every Monday for the week before). */
export function previousWeek(now: Date) {
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const from = new Date(thisMonday.getTime() - 7 * 24 * 3600_000);
  const to = new Date(thisMonday.getTime() - 24 * 3600_000);
  return { from: isoDay(from), to: isoDay(to) };
}

function requireApecam(deps: CoreDeps) {
  if (!deps.apecam)
    throw new ApiError(503, 'TRACKER_NOT_CONFIGURED', 'APECAM contract and wallets are not configured yet');
  return deps.apecam;
}

/**
 * Creates the weekly payout batch (S3-4). Pending rewards of the previous week are grouped per payout wallet,
 * scaled pro-rata when they exceed 50% of the treasury (D6), and marked `batched`. Users without an EVM payout
 * wallet stay `pending` and roll into a later batch once they link one.
 */
export async function createPayoutBatch(deps: CoreDeps, actorUserId: string) {
  const apecam = requireApecam(deps);
  const config = await deps.config();
  const now = deps.now?.() ?? new Date();
  const week = previousWeek(now);

  const [existing] = await deps.db
    .select()
    .from(payoutBatches)
    .where(and(eq(payoutBatches.periodFrom, week.from), eq(payoutBatches.periodTo, week.to)));
  if (existing)
    throw new ApiError(409, 'BATCH_EXISTS', `A batch for ${week.from} – ${week.to} already exists`);

  const pending = await deps.db
    .select({ reward: rewards, wallet: wallets.address })
    .from(rewards)
    .leftJoin(wallets, and(eq(wallets.userId, rewards.userId), eq(wallets.isPayout, true)))
    .where(and(eq(rewards.status, 'pending'), lte(rewards.period, week.to)));
  const payable = pending.filter((p) => p.wallet);
  if (!payable.length) throw new ApiError(409, 'NOTHING_TO_PAY', 'No pending rewards with a payout wallet');

  const treasury = await apecam.source.balanceOf(apecam.wallets.treasury);
  const { amounts, factor } = scaleBatchProRata(
    payable.map((p) => BigInt(p.reward.apecamAmount)),
    treasury,
    Math.round(config['s2e.treasury_scale_threshold'] * 10_000),
  );
  const total = amounts.reduce((a, b) => a + b, 0n);

  return deps.db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(payoutBatches)
      .values({
        periodFrom: week.from,
        periodTo: week.to,
        totalApecam: total.toString(),
        scaleFactor: factor.toString(),
        status: 'exported',
        createdBy: actorUserId,
        createdAt: now,
      })
      .returning();
    for (const [i, p] of payable.entries()) {
      await tx
        .update(rewards)
        .set({
          status: 'batched',
          payoutBatchId: batch!.id,
          payoutWallet: p.wallet,
          apecamAmount: amounts[i]!.toString(),
          scaleFactor: factor.toString(),
        })
        .where(eq(rewards.id, p.reward.id));
    }
    await tx.insert(modActions).values({
      actorUserId,
      action: 'create_payout_batch',
      targetType: 'reward',
      targetId: batch!.id,
      meta: {
        period: week,
        rewards: payable.length,
        totalRaw: total.toString(),
        factor,
        treasuryRaw: treasury.toString(),
      },
      createdAt: now,
    });
    return {
      batchId: batch!.id,
      period: week,
      rewards: payable.length,
      withoutPayoutWallet: pending.length - payable.length,
      totalBeforeRaw: payable.reduce((s, p) => s + BigInt(p.reward.apecamAmount), 0n).toString(),
      totalRaw: total.toString(),
      factor,
      treasuryRaw: treasury.toString(),
    };
  });
}

/** One row per payout wallet (a user's days are summed), ready for a multisend tool. */
export async function batchPayoutLines(deps: CoreDeps, batchId: string) {
  const rows = await deps.db
    .select({
      wallet: rewards.payoutWallet,
      amount: sql<string>`sum(${rewards.apecamAmount})::text`,
      paid: sql<boolean>`bool_and(${rewards.status} = 'paid')`,
    })
    .from(rewards)
    .where(eq(rewards.payoutBatchId, batchId))
    .groupBy(rewards.payoutWallet);
  return rows.map((r) => ({
    wallet: r.wallet!,
    amountRaw: r.amount,
    amount: fromRaw(BigInt(r.amount)),
    paid: r.paid,
  }));
}

export async function batchCsv(deps: CoreDeps, batchId: string) {
  const lines = await batchPayoutLines(deps, batchId);
  return [
    'wallet,amount_raw,amount',
    ...lines.filter((l) => !l.paid).map((l) => `${l.wallet},${l.amountRaw},${l.amount}`),
  ].join('\n');
}

export async function listBatches(deps: CoreDeps) {
  return deps.db.select().from(payoutBatches).orderBy(desc(payoutBatches.createdAt)).limit(52);
}

/** Admin cancels a farmed reward before it is paid (§8.3). */
export async function voidReward(deps: CoreDeps, actorUserId: string, rewardId: string, reason: string) {
  const [r] = await deps.db
    .update(rewards)
    .set({ status: 'void', voidReason: reason.slice(0, 500), payoutBatchId: null })
    .where(and(eq(rewards.id, rewardId), inArray(rewards.status, ['pending', 'batched'])))
    .returning();
  if (!r) throw new ApiError(409, 'NOT_VOIDABLE', 'Only pending or batched rewards can be voided');
  await deps.db.insert(modActions).values({
    actorUserId,
    action: 'void_reward',
    targetType: 'reward',
    targetId: rewardId,
    reason,
    createdAt: deps.now?.() ?? new Date(),
  });
  return { rewardId, status: 'void' as const };
}

async function markPaid(
  deps: CoreDeps,
  batchId: string,
  wallet: string,
  transfer: typeof treasuryTransfers.$inferSelect,
) {
  const paid = await deps.db
    .update(rewards)
    .set({ status: 'paid', payoutTxHash: transfer.txHash, paidAt: transfer.blockTime })
    .where(
      and(
        eq(rewards.payoutBatchId, batchId),
        eq(rewards.payoutWallet, wallet),
        eq(rewards.status, 'batched'),
      ),
    )
    .returning({ id: rewards.id });
  await deps.db
    .update(treasuryTransfers)
    .set({ matchedRewardIds: paid.map((p) => p.id) })
    .where(
      and(eq(treasuryTransfers.txHash, transfer.txHash), eq(treasuryTransfers.logIndex, transfer.logIndex)),
    );
  const [left] = await deps.db
    .select({ n: sql<number>`count(*) filter (where ${rewards.status} = 'batched')::int` })
    .from(rewards)
    .where(eq(rewards.payoutBatchId, batchId));
  await deps.db
    .update(payoutBatches)
    .set({ status: left!.n === 0 ? 'paid' : 'partially_paid' })
    .where(eq(payoutBatches.id, batchId));
  return paid.length;
}

/**
 * sync-payouts (every 5 min, S3-6): matches treasury transfers (indexed by sync-tracker) to batched rewards.
 * A transfer matches when exactly one open batch owes that wallet exactly that amount. Anything else is left
 * for manual reconciliation in the admin panel: guessing here could mark the wrong reward as paid.
 */
export async function syncPayouts(deps: CoreDeps) {
  const open = await deps.db
    .select()
    .from(treasuryTransfers)
    .where(isNull(treasuryTransfers.matchedRewardIds));
  let matched = 0;
  for (const t of open) {
    const owed = await deps.db
      .select({ batchId: rewards.payoutBatchId, total: sql<string>`sum(${rewards.apecamAmount})::text` })
      .from(rewards)
      .where(and(eq(rewards.status, 'batched'), eq(rewards.payoutWallet, t.toAddress)))
      .groupBy(rewards.payoutBatchId);
    const candidates = owed.filter((o) => o.total === t.amount);
    if (candidates.length !== 1) continue;
    await markPaid(deps, candidates[0]!.batchId!, t.toAddress, t);
    matched++;
  }
  return { transfers: open.length, matched, unmatched: open.length - matched };
}

export async function unmatchedTransfers(deps: CoreDeps) {
  return deps.db
    .select()
    .from(treasuryTransfers)
    .where(isNull(treasuryTransfers.matchedRewardIds))
    .orderBy(desc(treasuryTransfers.blockNumber))
    .limit(100);
}

/** Manual reconciliation: this transfer pays this wallet's share of this batch. */
export async function matchTransfer(
  deps: CoreDeps,
  actorUserId: string,
  args: { txHash: string; logIndex: number; batchId: string },
) {
  const [t] = await deps.db
    .select()
    .from(treasuryTransfers)
    .where(
      and(
        eq(treasuryTransfers.txHash, args.txHash),
        eq(treasuryTransfers.logIndex, args.logIndex),
        isNull(treasuryTransfers.matchedRewardIds),
      ),
    );
  if (!t) throw new ApiError(404, 'TRANSFER_NOT_FOUND', 'Unmatched transfer not found');
  const n = await markPaid(deps, args.batchId, t.toAddress, t);
  if (!n) throw new ApiError(409, 'NOTHING_OWED', 'That batch owes nothing to this wallet');
  await deps.db.insert(modActions).values({
    actorUserId,
    action: 'match_payout',
    targetType: 'reward',
    targetId: args.batchId,
    meta: { txHash: t.txHash, logIndex: t.logIndex, wallet: t.toAddress },
    createdAt: deps.now?.() ?? new Date(),
  });
  return { matchedRewards: n };
}

/** Total $APECAM ever paid out through Stream to Earn (tracker treasury panel). */
export async function totalPaidOut(deps: CoreDeps) {
  const [row] = await deps.db
    .select({ total: sql<string>`coalesce(sum(${rewards.apecamAmount}), 0)::text` })
    .from(rewards)
    .where(eq(rewards.status, 'paid'));
  return BigInt(row?.total ?? '0');
}

export async function listRewardsForAdmin(deps: CoreDeps, status: 'pending' | 'batched' | 'paid' | 'void') {
  return deps.db
    .select({ reward: rewards, displayName: users.displayName })
    .from(rewards)
    .innerJoin(users, eq(users.id, rewards.userId))
    .where(and(eq(rewards.status, status), gte(rewards.period, '2000-01-01')))
    .orderBy(desc(rewards.period))
    .limit(200);
}
