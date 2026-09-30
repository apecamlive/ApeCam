'use client';

import { formatDuration } from '@apecam/shared';
import { useQuery } from '@tanstack/react-query';
import { cx, ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/client/api';

interface Health {
  checkedAt: string;
  liveStreams: number;
  jobs: {
    name: string;
    state: 'ok' | 'failing' | 'stalled' | 'never_run';
    expectedGapMs: number;
    lastRunAt?: string;
    lastOkAt?: string;
    ms?: number;
    error?: string;
    failStreak?: number;
  }[];
  tracker:
    | { configured: false }
    | {
        configured: true;
        lastBlock: number | null;
        updatedAt: string | null;
        lagMs: number | null;
        lagging: boolean;
      };
}

const STATE_STYLE = {
  ok: 'bg-emerald/15 text-emerald-light',
  failing: 'bg-live/15 text-live',
  stalled: 'bg-warning/15 text-warning',
  never_run: 'bg-white/5 text-muted',
};

const ago = (iso?: string) =>
  iso ? `${formatDuration(Math.max(0, Date.now() - new Date(iso).getTime()) / 1000)} ago` : '—';

/** Admin-only view of the worker (S4-9). Refreshes every 30 s. */
export function HealthTab() {
  const q = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => api<Health>('/api/admin/health'),
    refetchInterval: 30_000,
  });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="Could not load system health." onRetry={() => q.refetch()} />;
  const h = q.data!;
  const t = h.tracker;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-card p-4">
          <p className="tag">live streams</p>
          <p className="font-display text-2xl font-bold">{h.liveStreams}</p>
        </div>
        <div className="glass rounded-card p-4">
          <p className="tag">burn tracker</p>
          <p className={cx('font-display text-2xl font-bold', t.configured && t.lagging && 'text-warning')}>
            {!t.configured ? 'not configured' : t.lagging ? 'lagging' : 'in sync'}
          </p>
          {t.configured && (
            <p className="text-xs text-muted">
              block {t.lastBlock ?? '—'} · updated {ago(t.updatedAt ?? undefined)}
            </p>
          )}
        </div>
        <div className="glass rounded-card p-4">
          <p className="tag">jobs with problems</p>
          <p className="font-display text-2xl font-bold">
            {h.jobs.filter((j) => j.state === 'failing' || j.state === 'stalled').length} / {h.jobs.length}
          </p>
        </div>
      </div>
      <div className="glass overflow-x-auto rounded-card">
        <table className="w-full text-left text-sm">
          <thead className="tag">
            <tr>
              <th className="p-3">Job</th>
              <th className="p-3">State</th>
              <th className="p-3">Last run</th>
              <th className="p-3">Last success</th>
              <th className="p-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {h.jobs.map((j) => (
              <tr key={j.name} className="border-t border-line">
                <td className="p-3 font-mono text-xs">{j.name}</td>
                <td className="p-3">
                  <span className={cx('rounded-full px-2 py-0.5 text-xs', STATE_STYLE[j.state])}>
                    {j.state.replace('_', ' ')}
                    {j.failStreak ? ` ×${j.failStreak}` : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap p-3 text-xs">
                  {ago(j.lastRunAt)}
                  {j.ms !== undefined && <span className="text-muted"> · {j.ms} ms</span>}
                </td>
                <td className="whitespace-nowrap p-3 text-xs">{ago(j.lastOkAt)}</td>
                <td className="max-w-xs truncate p-3 text-xs text-live" title={j.error}>
                  {j.error ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Checked {new Date(h.checkedAt).toLocaleTimeString()}. Runbooks: docs/runbooks in the repository.
      </p>
    </div>
  );
}
