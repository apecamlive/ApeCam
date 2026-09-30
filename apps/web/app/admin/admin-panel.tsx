'use client';

import { formatDuration, shortAddress } from '@apecam/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { Button, EmptyState, ErrorState, Modal, Skeleton, Tabs } from '@/components/ui';
import { ConnectButton } from '@/components/wallet/connect';
import { ConfigTab, PayoutsTab, ReconciliationTab } from './finance-tabs';
import { GoLiveTab } from './go-live-tab';
import { HealthTab } from './health-tab';
import { api, ApiRequestError } from '@/lib/client/api';

interface ReportedStream {
  streamId: string;
  title: string;
  ticker: string | null;
  status: string;
  blurred: boolean;
  snapshotUrl: string | null;
  reporters: number;
  categories: string[];
  reasons: string[];
  firstReportAt: string;
  streamerUserId: string;
}

interface LiveStream {
  id: string;
  title: string;
  viewers: number;
  startedAt: string | null;
  blurred: boolean;
  thumbnailUrl: string | null;
  address: string;
  ticker: string | null;
  chain: string;
  contract: string;
}

interface ModAction {
  id: number;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
  actorUserId: string;
}

type Tab = 'reports' | 'live' | 'log' | 'payouts' | 'reconcile' | 'config' | 'health' | 'go-live';

/** What a confirm dialog is about to do. Kill and ban always need a reason (it goes to the action log). */
type Pending =
  | { kind: 'kill'; streamId: string; label: string }
  | { kind: 'ban'; address: string; label: string }
  | { kind: 'hide'; chain: string; contract: string; label: string };

export function AdminPanel() {
  const { me, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('reports');
  const [pending, setPending] = useState<Pending | null>(null);
  const staff = me?.user?.role === 'moderator' || me?.user?.role === 'admin';

  if (loading) return <Skeleton className="h-96" />;
  if (!me?.user)
    return (
      <EmptyState
        title="Moderators only"
        body="Sign in with a moderator wallet."
        action={<ConnectButton />}
      />
    );
  if (!staff) return <EmptyState title="Moderators only" body="This wallet has no moderator access." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-black">Moderation</h1>
        <span className="tag">{me.user.role}</span>
      </div>
      <Tabs
        tabs={[
          { id: 'reports', label: 'Reports' },
          { id: 'live', label: 'Live streams' },
          { id: 'log', label: 'Action log' },
          { id: 'go-live', label: 'Go Live access' },
          // Money and settings are admin-only (S3-10); moderators do not see these tabs.
          ...(me.user.role === 'admin'
            ? ([
                { id: 'payouts', label: 'Payouts' },
                { id: 'reconcile', label: 'Reconciliation' },
                { id: 'config', label: 'Config' },
                { id: 'health', label: 'Health' },
              ] as const)
            : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'reports' && <ReportsTab onAsk={setPending} />}
      {tab === 'live' && <LiveTab onAsk={setPending} />}
      {tab === 'log' && <LogTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'reconcile' && <ReconciliationTab />}
      {tab === 'config' && <ConfigTab />}
      {tab === 'health' && <HealthTab />}
      {tab === 'go-live' && <GoLiveTab />}
      <ConfirmDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}

function useRefreshAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin') });
}

function ReportsTab({ onAsk }: { onAsk: (p: Pending) => void }) {
  const refresh = useRefreshAdmin();
  const q = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => api<{ streams: ReportedStream[] }>('/api/admin/reports'),
    refetchInterval: 15_000,
  });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="Could not load reports." onRetry={() => q.refetch()} />;
  const rows = q.data!.streams;
  if (!rows.length)
    return <EmptyState title="No open reports" body="New reports appear here within 15 seconds." />;

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.streamId} className="glass flex flex-col gap-3 rounded-card p-4 md:flex-row">
          <div className="aspect-video w-full shrink-0 overflow-hidden rounded-card bg-black md:w-56">
            {r.snapshotUrl ? (
              <img src={r.snapshotUrl} alt="Snapshot at report time" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted">No snapshot</div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <p className="font-semibold">
              {r.title} <span className="text-muted">· ${r.ticker ?? '?'}</span>
            </p>
            <p>
              <b className="text-live">{r.reporters}</b> reporter{r.reporters === 1 ? '' : 's'} ·{' '}
              {r.categories.join(', ')}
              {r.blurred && (
                <span className="ml-2 rounded bg-live/20 px-1.5 text-xs text-live">auto-blurred</span>
              )}
              <span className="ml-2 text-xs text-muted">stream {r.status}</span>
            </p>
            {r.reasons.slice(0, 3).map((reason, i) => (
              <p key={i} className="truncate text-xs text-fg-soft">
                “{reason}”
              </p>
            ))}
            <p className="text-xs text-subtle">first report {new Date(r.firstReportAt).toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap items-start gap-2 md:flex-col">
            {(r.status === 'live' || r.status === 'starting') && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => onAsk({ kind: 'kill', streamId: r.streamId, label: r.title })}
              >
                Kill stream
              </Button>
            )}
            <Button
              size="sm"
              onClick={async () => {
                await api(`/api/admin/reports/${r.streamId}/dismiss`, { body: {} });
                await refresh();
              }}
            >
              Dismiss
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function LiveTab({ onAsk }: { onAsk: (p: Pending) => void }) {
  const refresh = useRefreshAdmin();
  const q = useQuery({
    queryKey: ['admin-live'],
    queryFn: () => api<{ streams: LiveStream[] }>('/api/admin/streams/live'),
    refetchInterval: 15_000,
  });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="Could not load live streams." onRetry={() => q.refetch()} />;
  const rows = q.data!.streams;
  if (!rows.length) return <EmptyState title="Nobody is live" />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((s) => (
        <li key={s.id} className="glass flex flex-col gap-2 rounded-card p-3 text-sm">
          <Link
            href={`/t/${s.chain}/${s.contract}?s=${s.id}`}
            target="_blank"
            className="aspect-video overflow-hidden rounded-card bg-black"
          >
            {s.thumbnailUrl && <img src={s.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
          </Link>
          <p className="truncate font-semibold">{s.title}</p>
          <p className="text-xs text-muted">
            ${s.ticker ?? '?'} · {s.viewers} watching ·{' '}
            {s.startedAt ? formatDuration((Date.now() - new Date(s.startedAt).getTime()) / 1000) : '—'} ·{' '}
            <span className="font-mono">{shortAddress(s.address)}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => onAsk({ kind: 'kill', streamId: s.id, label: s.title })}
            >
              Kill
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => onAsk({ kind: 'ban', address: s.address, label: shortAddress(s.address) })}
            >
              Ban wallet
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await api(`/api/admin/streams/${s.id}/blur`, { body: { on: !s.blurred } });
                await refresh();
              }}
            >
              {s.blurred ? 'Unblur' : 'Blur'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onAsk({ kind: 'hide', chain: s.chain, contract: s.contract, label: `$${s.ticker ?? '?'}` })
              }
            >
              Hide token
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function LogTab() {
  const q = useQuery({
    queryKey: ['admin-log'],
    queryFn: () => api<{ actions: ModAction[] }>('/api/admin/mod-actions'),
  });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="Could not load the action log." onRetry={() => q.refetch()} />;
  const rows = q.data!.actions;
  if (!rows.length) return <EmptyState title="No moderator actions yet" />;
  return (
    <div className="glass overflow-x-auto rounded-card">
      <table className="w-full text-left text-sm">
        <thead className="tag">
          <tr>
            <th className="p-3">When</th>
            <th className="p-3">Who</th>
            <th className="p-3">Action</th>
            <th className="p-3">Target</th>
            <th className="p-3">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="whitespace-nowrap p-3 text-xs">{new Date(a.createdAt).toLocaleString()}</td>
              <td className="p-3">{a.actorName ?? shortAddress(a.actorUserId)}</td>
              <td className="p-3 font-mono text-xs">{a.action}</td>
              <td className="p-3 font-mono text-xs">
                {a.targetType}:{shortAddress(a.targetId, 6)}
              </td>
              <td className="p-3 text-xs text-fg-soft">{a.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAN_DURATIONS = [
  { id: '24h', label: '24 hours', ms: 24 * 3600_000 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 3600_000 },
  { id: 'permanent', label: 'Permanent', ms: 0 },
];

function ConfirmDialog({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
  const refresh = useRefreshAdmin();
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('24h');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pending) return null;

  const title =
    pending.kind === 'kill'
      ? `Kill “${pending.label}”?`
      : pending.kind === 'ban'
        ? `Ban ${pending.label}?`
        : `Hide ${pending.label}?`;
  const consequence =
    pending.kind === 'kill'
      ? 'The stream stops immediately for everyone.'
      : pending.kind === 'ban'
        ? 'Every wallet of this user is banned, their live streams stop and they are signed out.'
        : 'The token disappears from feed, search and Studio, and its live streams stop.';

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'kill')
        await api(`/api/admin/streams/${pending.streamId}/kill`, { body: { reason } });
      if (pending.kind === 'ban') {
        const d = BAN_DURATIONS.find((x) => x.id === duration)!;
        const until = d.id === 'permanent' ? 'permanent' : new Date(Date.now() + d.ms).toISOString();
        await api(`/api/admin/wallets/${pending.address}/ban`, { body: { until, reason } });
      }
      if (pending.kind === 'hide')
        await api(`/api/admin/tokens/${pending.chain}/${pending.contract}/hide`, {
          body: { hidden: true, reason },
        });
      await refresh();
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-fg-soft">{consequence}</p>
        {pending.kind === 'ban' && (
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            aria-label="Ban duration"
            className="h-10 rounded-card border border-line bg-input px-3"
          >
            {BAN_DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Reason (saved in the action log)"
          aria-label="Reason"
          className="h-10 rounded-card border border-line bg-input px-3 focus:border-primary focus:outline-none"
        />
        {error && <p className="text-live">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy || !reason.trim()} onClick={confirm}>
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
