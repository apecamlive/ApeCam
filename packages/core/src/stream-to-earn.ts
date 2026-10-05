import { holdingChecks, reports, rewards, streamMinutes, streams, users } from '@apecam/db';
import { computeDailyReward, nextTier, type RewardConfig } from '@apecam/rewards';
import type { AppConfig } from '@apecam/shared';
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { identity } from './streams';

export const floorToMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);
const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function rewardConfig(config: AppConfig): RewardConfig {
  return { tiers: config['s2e.tiers'], dailyCap: config['s2e.daily_cap'] };
}

/** Why a minute did not count, in the order the Studio shows them. */
export type MinuteFailure = 'holding' | 'viewers' | 'video' | 'report' | 'blurred';

/**
 * count-minutes (every minute, S3-2). A live minute counts toward Stream to Earn only if all hold (§8.1):
 * holding re-check passed ≤ 6 min ago · ≥ N signed-in viewers who are not the streamer and whose account is
 * old enough · a valid frame ≤ 2 min ago · no open report · not blurred.
 * Each viewer is credited to at most one stream per minute, so one person cannot prop up ten streams.
 */
export async function countMinutes(deps: CoreDeps) {
  const config = await deps.config();
  const now = deps.now?.() ?? new Date();
  const minuteAt = floorToMinute(now);
  const minViewers = config['s2e.min_viewers'];
  const accountAgeMs = config['s2e.min_viewer_wallet_age_hours'] * 3600_000;

  const live = await deps.db
    .select()
    .from(streams)
    .where(eq(streams.status, 'live'))
    .orderBy(streams.startedAt, streams.id); // deterministic viewer assignment
  const credited = new Set<string>();
  const results: { streamId: string; valid: boolean; viewers: number; failures: MinuteFailure[] }[] = [];

  for (const s of live) {
    const ids = await deps.streaming.listParticipantIdentities(s.livekitRoom).catch(() => [] as string[]);
    const viewerIds = [
      ...new Set(ids.filter((id) => id.startsWith('u_')).map((id) => identity.userIdOf(id)!)),
    ].filter((uid) => uid !== s.userId && !credited.has(uid));
    const old = viewerIds.length
      ? await deps.db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.id, viewerIds),
              lt(users.createdAt, new Date(now.getTime() - accountAgeMs)),
              sql`(${users.bannedUntil} is null or ${users.bannedUntil} < ${now})`,
            ),
          )
      : [];
    const eligible = old.map((o) => o.id);

    const [check] = await deps.db
      .select()
      .from(holdingChecks)
      .where(eq(holdingChecks.streamId, s.id))
      .orderBy(desc(holdingChecks.checkedAt))
      .limit(1);
    const [open] = await deps.db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.streamId, s.id), eq(reports.status, 'open')))
      .limit(1);

    const holdingOk = !!check?.passed && now.getTime() - check.checkedAt.getTime() <= 6 * 60_000;
    const viewersOk = eligible.length >= minViewers;
    const videoOk = !!s.lastFrameOkAt && now.getTime() - s.lastFrameOkAt.getTime() <= 2 * 60_000;
    const noReportOk = !open;
    const valid = holdingOk && viewersOk && videoOk && noReportOk && !s.blurred;
    // Only credit viewers to a stream whose minute actually counts.
    if (valid) for (const uid of eligible) credited.add(uid);

    await deps.db
      .insert(streamMinutes)
      .values({
        streamId: s.id,
        userId: s.userId,
        walletId: s.walletId,
        minuteAt,
        viewers: eligible.length,
        holdingOk,
        viewersOk,
        videoOk,
        noReportOk,
        valid,
      })
      .onConflictDoNothing();

    const failures: MinuteFailure[] = [];
    if (!holdingOk) failures.push('holding');
    if (!viewersOk) failures.push('viewers');
    if (!videoOk) failures.push('video');
    if (!noReportOk) failures.push('report');
    if (s.blurred) failures.push('blurred');
    results.push({ streamId: s.id, valid, viewers: eligible.length, failures });
  }
  return results;
}

/** Distinct valid minutes per user in [from, to): parallel streams of one user count once (D15). */
async function validMinutesByUser(deps: CoreDeps, from: Date, to: Date, userId?: string) {
  const rows = await deps.db
    .select({
      userId: streamMinutes.userId,
      minutes: sql<number>`count(distinct ${streamMinutes.minuteAt})::int`,
    })
    .from(streamMinutes)
    .where(
      and(
        eq(streamMinutes.valid, true),
        gte(streamMinutes.minuteAt, from),
        lt(streamMinutes.minuteAt, to),
        userId ? eq(streamMinutes.userId, userId) : undefined,
      ),
    )
    .groupBy(streamMinutes.userId);
  return rows;
}

/**
 * close-rewards (daily at 00:10 UTC, S3-3): yesterday's valid minutes → reward per user (D1–D3).
 * Idempotent: re-running updates pending rewards and never touches batched or paid ones.
 * Pro-rata treasury scaling happens later, when the weekly batch is created (D6).
 */
export async function closeRewards(deps: CoreDeps, day?: Date) {
  const config = await deps.config();
  const now = deps.now?.() ?? new Date();
  const from = startOfUtcDay(day ?? new Date(now.getTime() - 24 * 3600_000));
  const to = new Date(from.getTime() + 24 * 3600_000);
  const period = isoDay(from);
  const cfg = rewardConfig(config);

  let created = 0;
  for (const row of await validMinutesByUser(deps, from, to)) {
    const amount = computeDailyReward(row.minutes, cfg);
    if (amount === 0n) continue;
    const res = await deps.db
      .insert(rewards)
      .values({
        userId: row.userId,
        period,
        validMinutes: row.minutes,
        apecamAmount: amount.toString(),
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: [rewards.userId, rewards.period],
        set: { validMinutes: row.minutes, apecamAmount: amount.toString() },
        where: eq(rewards.status, 'pending'),
      })
      .returning({ id: rewards.id });
    created += res.length;
  }
  return { period, rewards: created };
}

/**
 * Nightly job: closes yesterday and re-closes the `days - 1` days before it, so a day missed during a worker
 * outage is still paid. Safe to repeat: only `pending` rewards are updated, never batched / paid / void.
 */
export async function closeRecentRewards(deps: CoreDeps, days = 3) {
  const now = deps.now?.() ?? new Date();
  const results = [];
  for (let i = days; i >= 1; i--) {
    results.push(await closeRewards(deps, new Date(now.getTime() - i * 24 * 3600_000)));
  }
  return results;
}

/** Today's progress for the Studio: valid minutes so far, what that earns, and the next tier. */
export async function todayProgress(deps: CoreDeps, userId: string) {
  const config = await deps.config();
  const now = deps.now?.() ?? new Date();
  const from = startOfUtcDay(now);
  const [row] = await validMinutesByUser(deps, from, new Date(from.getTime() + 24 * 3600_000), userId);
  const minutes = row?.minutes ?? 0;
  const cfg = rewardConfig(config);
  return {
    validMinutesToday: minutes,
    earnedTodayRaw: computeDailyReward(minutes, cfg).toString(),
    nextTier: nextTier(minutes, cfg),
  };
}

/** Last recorded minute of a stream, with the reasons it did or did not count. */
export async function lastMinute(deps: CoreDeps, streamId: string) {
  const [m] = await deps.db
    .select()
    .from(streamMinutes)
    .where(eq(streamMinutes.streamId, streamId))
    .orderBy(desc(streamMinutes.minuteAt))
    .limit(1);
  if (!m) return null;
  const failures: MinuteFailure[] = [];
  if (!m.holdingOk) failures.push('holding');
  if (!m.viewersOk) failures.push('viewers');
  if (!m.videoOk) failures.push('video');
  if (!m.noReportOk) failures.push('report');
  return { minuteAt: m.minuteAt, valid: m.valid, viewers: m.viewers, failures };
}

/** The user's own rewards: totals by status and history (S3-3 `/api/me/rewards`). */
export async function myRewards(deps: CoreDeps, userId: string) {
  const rows = await deps.db
    .select()
    .from(rewards)
    .where(eq(rewards.userId, userId))
    .orderBy(desc(rewards.period))
    .limit(120);
  const sum = (statuses: string[]) =>
    rows
      .filter((r) => statuses.includes(r.status))
      .reduce((s, r) => s + BigInt(r.apecamAmount), 0n)
      .toString();
  return {
    totals: {
      pendingRaw: sum(['pending', 'batched']),
      paidRaw: sum(['paid']),
      earnedRaw: sum(['pending', 'batched', 'paid']),
    },
    rewards: rows.map((r) => ({
      period: r.period,
      validMinutes: r.validMinutes,
      amountRaw: r.apecamAmount,
      scaleFactor: Number(r.scaleFactor),
      status: r.status,
      payoutTxHash: r.payoutTxHash,
      paidAt: r.paidAt,
      voidReason: r.voidReason,
    })),
  };
}
