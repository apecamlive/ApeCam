import { reports, streams, tokens, type REPORT_CATEGORIES } from '@apecam/db';
import { ApiError } from '@apecam/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { getStream } from './streams';

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Categories that page a moderator on the first report, not only on auto-blur. */
const SEVERE: ReportCategory[] = ['sexual', 'self_harm', 'violence', 'illegal'];

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

async function alert(deps: CoreDeps, text: string) {
  if (!deps.notifier) return;
  await deps.notifier
    .send(text)
    .catch((err) => deps.log?.warn({ err: String(err) }, 'moderator alert failed'));
}

/**
 * Viewer report (S2-3). One report per user per stream. When enough *different users* report within the
 * window (D9: 3 in 5 min), the stream is blurred for everyone until a moderator reviews it.
 */
export async function createReport(
  deps: CoreDeps,
  args: { userId: string; streamId: string; category: ReportCategory; reason?: string },
) {
  const stream = await getStream(deps, args.streamId);
  if (stream.status !== 'live' && stream.status !== 'starting') {
    throw new ApiError(410, 'STREAM_ENDED', 'This stream has ended');
  }
  if (stream.userId === args.userId)
    throw new ApiError(400, 'CANNOT_REPORT_SELF', 'You cannot report your own stream');
  const now = deps.now?.() ?? new Date();
  let report;
  try {
    [report] = await deps.db
      .insert(reports)
      .values({
        streamId: stream.id,
        reporterUserId: args.userId,
        category: args.category,
        reason: args.reason?.slice(0, 500),
        snapshotUrl: stream.thumbnailUrl,
        createdAt: now,
      })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ApiError(409, 'ALREADY_REPORTED', 'You already reported this stream');
    throw err;
  }

  const config = await deps.config();
  const since = new Date(now.getTime() - config['mod.autoblur_window_sec'] * 1000);
  const [{ reporters }] = (await deps.db
    .select({ reporters: sql<number>`count(distinct ${reports.reporterUserId})::int` })
    .from(reports)
    .where(and(eq(reports.streamId, stream.id), gte(reports.createdAt, since)))) as [{ reporters: number }];

  const [token] = await deps.db
    .select({ ticker: tokens.ticker })
    .from(tokens)
    .where(eq(tokens.id, stream.tokenId));
  const label = `"${stream.title}" ($${token?.ticker ?? '?'}, stream ${stream.id})`;

  let blurred = stream.blurred;
  if (!blurred && reporters >= config['mod.autoblur_reports']) {
    await deps.db.update(streams).set({ blurred: true }).where(eq(streams.id, stream.id));
    await deps.streaming
      .sendData(stream.livekitRoom, 'system', { type: 'blur', on: true })
      .catch(() => undefined);
    blurred = true;
    await alert(deps, `🚨 Auto-blurred after ${reporters} reports: ${label}`);
  } else if (SEVERE.includes(args.category)) {
    await alert(deps, `⚠️ ${args.category} report: ${label}`);
  }
  return { reportId: report!.id, blurred };
}

/** Telegram bot notifier (ALERT_TELEGRAM_BOT_TOKEN / ALERT_TELEGRAM_CHAT_ID). */
export function telegramNotifier(botToken: string, chatId: string, fetchImpl: typeof fetch = fetch) {
  return {
    async send(text: string) {
      await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(5000),
      });
    },
  };
}
