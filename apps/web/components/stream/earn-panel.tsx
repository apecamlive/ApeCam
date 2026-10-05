import { formatCompact } from '@apecam/shared';
import { cx } from '@/components/ui';
import { MINUTE_FAILURES, tokens18, type StreamStatus } from '@/lib/client/api';

/** Studio live panel: today's Stream to Earn progress and why the last minute did or did not count (S3-9). */
export function EarnPanel({ earn }: { earn: StreamStatus['earn'] }) {
  const next = earn.nextTier;
  const progress = next ? Math.min(100, (earn.validMinutesToday / next.minutes) * 100) : 100;
  const last = earn.lastMinute;
  return (
    <section className="glass flex flex-col gap-3 rounded-card p-4 text-sm" aria-label="Stream to Earn">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="tag">Stream to Earn · today (UTC)</p>
        <p>
          <b>{earn.validMinutesToday}</b> valid min ·{' '}
          <b className="text-emerald-light">{formatCompact(tokens18(earn.earnedTodayRaw), 1)} $APECAM</b>
        </p>
        <p className="text-xs text-muted">
          {next
            ? `${next.minutes - earn.validMinutesToday} more min → ${formatCompact(next.total)} $APECAM`
            : 'Daily maximum reached'}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-emerald" style={{ width: `${progress}%` }} />
      </div>
      {last && (
        <div
          className={cx(
            'rounded-card px-3 py-2 text-xs',
            last.valid ? 'bg-emerald/10 text-emerald-light' : 'bg-warning/10 text-fg-soft',
          )}
        >
          {last.valid ? (
            `Last minute counted · ${last.viewers} eligible viewers`
          ) : (
            <>
              Last minute did not count:
              <ul className="mt-1 list-disc pl-4">
                {last.failures.map((f) => (
                  <li key={f}>{MINUTE_FAILURES[f] ?? f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
