import {
  encodeBackup,
  exportBackup,
  modActions,
  reports,
  streamMinutes,
  streams,
  syncCursors,
} from '@apecam/db';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';

/**
 * Worker job monitoring (S4-9). The worker records every run in KV; three failures in a row alert the
 * moderator channel once, and the first success afterwards sends a recovery note. The admin Health tab
 * reads the same records.
 */

/** Longest normal gap between two runs of each job; a job silent for 3× this is reported as stalled. */
export const JOB_EXPECTED_GAP_MS: Record<string, number> = {
  'recheck-holdings': 30_000,
  'refresh-prices': 60_000,
  'stale-streams': 60_000,
  'frame-check': 60_000,
  'count-minutes': 60_000,
  'close-rewards': 24 * 3_600_000,
  'sync-tracker': 5 * 60_000,
  'sync-payouts': 5 * 60_000,
  monitor: 5 * 60_000,
  'backup-db': 24 * 3_600_000,
  'daily-report': 24 * 3_600_000,
};

export const FAILURE_ALERT_STREAK = 3;
/** Tracker cursor older than this (while configured) is lagging. `safe` itself trails head by ~9 min. */
export const TRACKER_LAG_ALERT_MS = 30 * 60_000;

export interface JobRecord {
  lastRunAt: string;
  ok: boolean;
  ms: number;
  error?: string;
  failStreak: number;
  lastOkAt?: string;
}

const jobKey = (name: string) => `job:${name}:last`;
const RECORD_TTL_SEC = 7 * 86_400;

export async function recordJobRun(
  deps: CoreDeps,
  name: string,
  outcome: { ok: true; ms: number } | { ok: false; ms: number; error: string },
): Promise<JobRecord> {
  const now = (deps.now?.() ?? new Date()).toISOString();
  const prevRaw = await deps.kv.get(jobKey(name));
  const prev = prevRaw ? (JSON.parse(prevRaw) as JobRecord) : undefined;
  const failStreak = outcome.ok ? 0 : (prev?.failStreak ?? 0) + 1;
  const record: JobRecord = {
    lastRunAt: now,
    ok: outcome.ok,
    ms: outcome.ms,
    error: outcome.ok ? undefined : outcome.error.slice(0, 500),
    failStreak,
    lastOkAt: outcome.ok ? now : prev?.lastOkAt,
  };
  await deps.kv.set(jobKey(name), JSON.stringify(record), RECORD_TTL_SEC);

  if (!outcome.ok && failStreak === FAILURE_ALERT_STREAK) {
    await notify(deps, `⚠️ Job ${name} failed ${failStreak} times in a row: ${record.error}`);
  } else if (outcome.ok && (prev?.failStreak ?? 0) >= FAILURE_ALERT_STREAK) {
    await notify(deps, `✅ Job ${name} recovered after ${prev!.failStreak} failures`);
  }
  return record;
}

async function notify(deps: CoreDeps, text: string) {
  deps.log?.error({ alert: text }, 'ops alert');
  await deps.notifier?.send(text).catch((err) => deps.log?.warn({ err: String(err) }, 'alert send failed'));
}

export async function trackerStatus(deps: CoreDeps) {
  if (!deps.apecam) return { configured: false as const };
  const [cursor] = await deps.db.select().from(syncCursors).where(eq(syncCursors.name, 'tracker:robinhood'));
  const now = deps.now?.() ?? new Date();
  const lagMs = cursor ? now.getTime() - cursor.updatedAt.getTime() : null;
  return {
    configured: true as const,
    lastBlock: cursor?.lastBlock ?? null,
    updatedAt: cursor?.updatedAt ?? null,
    lagMs,
    lagging: lagMs === null || lagMs > TRACKER_LAG_ALERT_MS,
  };
}

/** `monitor` job: alerts when the tracker falls behind, at most once an hour. */
export async function monitorSystem(deps: CoreDeps) {
  const tracker = await trackerStatus(deps);
  const trackerLagging = tracker.configured && tracker.lagging;
  if (trackerLagging) {
    const key = 'alert:tracker-lag';
    if (!(await deps.kv.get(key))) {
      await deps.kv.set(key, '1', 3600);
      const mins =
        tracker.lagMs === null ? 'never synced' : `${Math.round(tracker.lagMs / 60_000)} min behind`;
      await notify(deps, `⚠️ Burn tracker is lagging: ${mins} (last block ${tracker.lastBlock ?? '—'})`);
    }
  }
  return { trackerLagging, staleReports: await alertStaleReports(deps) };
}

/** Launch target (T-L-M2): no report stays open longer than this. */
export const REPORT_SLA_MS = 15 * 60_000;

/** Streams with a report open longer than the SLA; each stream is alerted once. */
async function alertStaleReports(deps: CoreDeps) {
  const cutoff = new Date((deps.now?.() ?? new Date()).getTime() - REPORT_SLA_MS);
  const stale = await deps.db
    .select({
      streamId: reports.streamId,
      title: streams.title,
      reporters: sql<number>`count(*)::int`,
      oldest: sql<Date>`min(${reports.createdAt})`,
    })
    .from(reports)
    .innerJoin(streams, eq(streams.id, reports.streamId))
    .where(and(eq(reports.status, 'open'), lt(reports.createdAt, cutoff)))
    .groupBy(reports.streamId, streams.title);
  for (const s of stale) {
    const key = `alert:report-sla:${s.streamId}`;
    if (await deps.kv.get(key)) continue;
    await deps.kv.set(key, '1', 24 * 3600);
    await notify(
      deps,
      `⏰ Report open > ${REPORT_SLA_MS / 60_000} min: "${s.title}" (${s.reporters} reporter${s.reporters === 1 ? '' : 's'}). Admin → Reports.`,
    );
  }
  return stale.length;
}

/**
 * Daily ops report for launch week (L-8), sent to the alert channel at 00:20 UTC for the previous UTC day:
 * activity, moderation speed, rewards, and anything currently broken.
 */
export async function dailyOpsReport(deps: CoreDeps, day?: Date) {
  const now = deps.now?.() ?? new Date();
  const ref = day ?? new Date(now.getTime() - 24 * 3600_000);
  const from = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 3600_000);
  const inDay = (col: typeof streams.startedAt | typeof reports.createdAt) =>
    and(gte(col, from), lt(col, to));

  const [act] = (await deps.db
    .select({
      streams: sql<number>`count(*)::int`,
      streamers: sql<number>`count(distinct ${streams.userId})::int`,
      tokens: sql<number>`count(distinct ${streams.tokenId})::int`,
      peakViewers: sql<number>`coalesce(max(${streams.peakViewers}), 0)::int`,
    })
    .from(streams)
    .where(inDay(streams.startedAt))) as [
    { streams: number; streamers: number; tokens: number; peakViewers: number },
  ];
  const [mod] = (await deps.db
    .select({
      opened: sql<number>`count(*)::int`,
      handled: sql<number>`count(${reports.handledAt})::int`,
      // Minutes from report to moderator action, median over handled reports.
      medianMin: sql<
        number | null
      >`percentile_cont(0.5) within group (order by extract(epoch from ${reports.handledAt} - ${reports.createdAt}) / 60)`,
    })
    .from(reports)
    .where(inDay(reports.createdAt))) as [{ opened: number; handled: number; medianMin: number | null }];
  const [openNow] = (await deps.db
    .select({ n: sql<number>`count(distinct ${reports.streamId})::int` })
    .from(reports)
    .where(eq(reports.status, 'open'))) as [{ n: number }];
  const [bans] = (await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(modActions)
    .where(
      and(eq(modActions.action, 'ban_wallet'), gte(modActions.createdAt, from), lt(modActions.createdAt, to)),
    )) as [{ n: number }];
  const [minutes] = (await deps.db
    .select({
      n: sql<number>`count(distinct (${streamMinutes.userId}, date_trunc('minute', ${streamMinutes.minuteAt})))::int`,
    })
    .from(streamMinutes)
    .where(
      and(eq(streamMinutes.valid, true), gte(streamMinutes.minuteAt, from), lt(streamMinutes.minuteAt, to)),
    )) as [{ n: number }];

  const health = await systemHealth(deps);
  const broken = health.jobs.filter((j) => j.state === 'failing' || j.state === 'stalled').map((j) => j.name);
  const trackerLine = !health.tracker.configured
    ? 'not configured'
    : health.tracker.lagging
      ? 'LAGGING'
      : 'in sync';

  const report = {
    day: from.toISOString().slice(0, 10),
    streams: act.streams,
    streamers: act.streamers,
    tokens: act.tokens,
    peakViewers: act.peakViewers,
    validMinutes: minutes.n,
    reportsOpened: mod.opened,
    reportsHandled: mod.handled,
    medianMinutesToAction: mod.medianMin === null ? null : Math.round(Number(mod.medianMin) * 10) / 10,
    streamsWithOpenReports: openNow.n,
    bans: bans.n,
    brokenJobs: broken,
    tracker: trackerLine,
  };
  const text = [
    `📊 APECAM ${report.day} (UTC)`,
    `Streams ${report.streams} · streamers ${report.streamers} · tokens ${report.tokens} · peak viewers ${report.peakViewers}`,
    `Valid S2E minutes ${report.validMinutes}`,
    `Reports ${report.reportsOpened} opened / ${report.reportsHandled} handled · median to action ${report.medianMinutesToAction ?? '—'} min · open now ${report.streamsWithOpenReports} · bans ${report.bans}`,
    `Jobs ${broken.length ? `⚠️ ${broken.join(', ')}` : 'all ok'} · tracker ${trackerLine}`,
  ].join('\n');
  await deps.notifier?.send(text).catch(() => undefined);
  return report;
}

/** Admin Health tab: every job's last run, stalled jobs, tracker lag, live stream count. */
export async function systemHealth(deps: CoreDeps) {
  const now = deps.now?.() ?? new Date();
  const jobs = await Promise.all(
    Object.entries(JOB_EXPECTED_GAP_MS).map(async ([name, gap]) => {
      const raw = await deps.kv.get(jobKey(name));
      const rec = raw ? (JSON.parse(raw) as JobRecord) : null;
      const sinceMs = rec ? now.getTime() - new Date(rec.lastRunAt).getTime() : null;
      const state: 'ok' | 'failing' | 'stalled' | 'never_run' = !rec
        ? 'never_run'
        : sinceMs! > gap * 3
          ? 'stalled'
          : rec.ok
            ? 'ok'
            : 'failing';
      return { name, expectedGapMs: gap, state, ...rec };
    }),
  );
  const [live] = (await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(streams)
    .where(eq(streams.status, 'live'))) as [{ n: number }];
  return { checkedAt: now.toISOString(), jobs, tracker: await trackerStatus(deps), liveStreams: live.n };
}

/** Daily logical backup to the private R2 bucket (S4-10). Retention is an R2 lifecycle rule (30 days). */
export async function backupDatabase(deps: CoreDeps) {
  if (!deps.backups) return { skipped: 'R2_BACKUP_BUCKET not configured' };
  const now = deps.now?.() ?? new Date();
  const backup = await exportBackup(deps.db, now);
  const body = encodeBackup(backup);
  const key = `db/${now.toISOString().slice(0, 10)}.json.gz`;
  await deps.backups.put(key, body, 'application/gzip');
  const rows = Object.values(backup.tables).reduce((n, t) => n + t.length, 0);
  return { key, bytes: body.length, rows };
}
