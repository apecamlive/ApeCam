'use client';

import { formatCompact, shortAddress } from '@apecam/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { api, ApiRequestError, tokens18 } from '@/lib/client/api';

interface Batch {
  id: string;
  periodFrom: string;
  periodTo: string;
  totalApecam: string;
  scaleFactor: string;
  status: string;
  createdAt: string;
  lines: { wallet: string; amountRaw: string; amount: string; paid: boolean }[];
}

interface PendingReward {
  id: string;
  period: string;
  validMinutes: number;
  apecamAmount: string;
  userId: string;
  displayName: string | null;
}

function useRefresh(prefix: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(prefix) });
}

/** Weekly payouts (D4): create last week's batch, download the CSV, watch lines turn paid (S3-10). */
export function PayoutsTab() {
  const refresh = useRefresh('admin-payouts');
  const q = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => api<{ batches: Batch[]; pending: PendingReward[] }>('/api/admin/payouts'),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{
        rewards: number;
        withoutPayoutWallet: number;
        totalBeforeRaw: string;
        totalRaw: string;
        factor: number;
      }>('/api/admin/payouts', { body: {} });
      setMsg({
        ok: true,
        text: `Batch created: ${r.rewards} rewards, ${formatCompact(tokens18(r.totalBeforeRaw))} → ${formatCompact(tokens18(r.totalRaw))} $APECAM${
          r.factor < 1 ? ` (scaled ${Math.round(r.factor * 1000) / 10}% for the treasury)` : ''
        }. ${r.withoutPayoutWallet} reward(s) wait for a payout wallet.`,
      });
      await refresh();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiRequestError ? err.message : 'Could not create the batch',
      });
    } finally {
      setBusy(false);
    }
  }

  async function voidOne(r: PendingReward) {
    const reason = window.prompt(
      `Void ${formatCompact(tokens18(r.apecamAmount))} $APECAM for ${r.displayName ?? shortAddress(r.userId)} (${r.period})? Reason:`,
    );
    if (!reason?.trim()) return;
    await api(`/api/admin/rewards/${r.id}/void`, { body: { reason } }).catch((err) =>
      setMsg({ ok: false, text: String(err.message) }),
    );
    await refresh();
  }

  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) {
    const forbidden = q.error instanceof ApiRequestError && q.error.status === 403;
    return forbidden ? (
      <EmptyState title="Admins only" />
    ) : (
      <ErrorState message="Could not load payouts." onRetry={() => q.refetch()} />
    );
  }
  const { batches, pending } = q.data!;
  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-center gap-3 rounded-card p-4 text-sm">
        <p>
          <b>{pending.length}</b> pending reward(s),{' '}
          {formatCompact(tokens18(pending.reduce((s, r) => s + BigInt(r.apecamAmount), 0n)))} $APECAM
        </p>
        <Button variant="primary" className="ml-auto" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create last week’s batch'}
        </Button>
      </div>
      {msg && <p className={msg.ok ? 'text-sm text-emerald-light' : 'text-sm text-live'}>{msg.text}</p>}

      {batches.map((b) => (
        <section key={b.id} className="glass rounded-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-sm">
            <b>
              {b.periodFrom} – {b.periodTo}
            </b>
            <span>{formatCompact(tokens18(b.totalApecam))} $APECAM</span>
            {Number(b.scaleFactor) < 1 && (
              <span className="text-xs text-warning">
                scaled {Math.round(Number(b.scaleFactor) * 1000) / 10}%
              </span>
            )}
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{b.status}</span>
            <a className="ml-auto text-primary-light hover:underline" href={`/api/admin/payouts/${b.id}/csv`}>
              Download CSV
            </a>
          </div>
          <ul>
            {b.lines.map((l) => (
              <li
                key={l.wallet}
                className="flex items-center gap-3 border-t border-line px-4 py-2 font-mono text-xs"
              >
                {shortAddress(l.wallet, 6)}
                <span className="ml-auto">{l.amount}</span>
                <span className={l.paid ? 'text-emerald-light' : 'text-muted'}>
                  {l.paid ? 'paid' : 'unpaid'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {pending.length > 0 && (
        <section className="glass rounded-card">
          <h3 className="border-b border-line px-4 py-3 font-semibold">Pending rewards</h3>
          <ul>
            {pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-t border-line px-4 py-2 text-sm">
                <span className="w-24 font-mono text-xs">{r.period}</span>
                <span>{r.displayName ?? shortAddress(r.userId)}</span>
                <span className="text-xs text-muted">{r.validMinutes} min</span>
                <span className="ml-auto">{formatCompact(tokens18(r.apecamAmount))}</span>
                <Button size="sm" variant="ghost" onClick={() => voidOne(r)}>
                  Void
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface Transfer {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  toAddress: string;
  amount: string;
  blockTime: string;
}

/** Treasury transfers sync-payouts could not match by itself (S3-10). */
export function ReconciliationTab() {
  const refresh = useRefresh('admin-');
  const q = useQuery({
    queryKey: ['admin-reconciliation'],
    queryFn: () => api<{ transfers: Transfer[] }>('/api/admin/reconciliation'),
  });
  const batches = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => api<{ batches: Batch[] }>('/api/admin/payouts'),
  });
  const [error, setError] = useState<string | null>(null);
  if (q.isPending) return <Skeleton className="h-40" />;
  if (q.isError)
    return <ErrorState message="Could not load treasury transfers." onRetry={() => q.refetch()} />;
  const open = (batches.data?.batches ?? []).filter((b) => b.status !== 'paid');
  if (!q.data!.transfers.length)
    return (
      <EmptyState
        title="Nothing to reconcile"
        body="Every treasury transfer matched a payout automatically."
      />
    );
  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-live">{error}</p>}
      {q.data!.transfers.map((t) => (
        <div
          key={`${t.txHash}:${t.logIndex}`}
          className="glass flex flex-wrap items-center gap-3 rounded-card p-3 text-sm"
        >
          <a
            href={`https://robinhoodchain.blockscout.com/tx/${t.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary-light"
          >
            {shortAddress(t.txHash, 6)}
          </a>
          <span>→ {shortAddress(t.toAddress)}</span>
          <b>{formatCompact(tokens18(t.amount), 2)} $APECAM</b>
          <span className="text-xs text-muted">{new Date(t.blockTime).toLocaleString()}</span>
          <select
            className="ml-auto h-8 rounded-card border border-line bg-input px-2 text-xs"
            defaultValue=""
            aria-label="Match to batch"
            onChange={async (e) => {
              if (!e.target.value) return;
              setError(null);
              try {
                await api('/api/admin/reconciliation', {
                  body: { txHash: t.txHash, logIndex: t.logIndex, batchId: e.target.value },
                });
                await refresh();
              } catch (err) {
                setError(err instanceof ApiRequestError ? err.message : 'Could not match');
              }
            }}
          >
            <option value="">Match to batch…</option>
            {open.map((b) => (
              <option key={b.id} value={b.id}>
                {b.periodFrom} – {b.periodTo}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

interface Setting {
  key: string;
  value: unknown;
  defaultValue: unknown;
}

/** Runtime settings without a deploy (tiers, thresholds, D20). Every change is written to the action log. */
export function ConfigTab() {
  const refresh = useRefresh('admin-config');
  const q = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => api<{ settings: Setting[] }>('/api/admin/config'),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) {
    const forbidden = q.error instanceof ApiRequestError && q.error.status === 403;
    return forbidden ? (
      <EmptyState title="Admins only" />
    ) : (
      <ErrorState message="Could not load settings." onRetry={() => q.refetch()} />
    );
  }

  async function save(s: Setting) {
    setMsg(null);
    let value: unknown;
    try {
      value = JSON.parse(drafts[s.key]!);
    } catch {
      setMsg({ ok: false, text: `${s.key}: not valid JSON` });
      return;
    }
    try {
      await api('/api/admin/config', { method: 'PATCH', body: { key: s.key, value } });
      setDrafts(({ [s.key]: _saved, ...rest }) => rest);
      setMsg({ ok: true, text: `${s.key} saved. Takes effect within a minute.` });
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiRequestError ? err.message : 'Could not save' });
    }
  }

  return (
    <div className="glass overflow-x-auto rounded-card">
      {msg && (
        <p className={`px-4 pt-3 text-sm ${msg.ok ? 'text-emerald-light' : 'text-live'}`}>{msg.text}</p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="tag">
          <tr>
            <th className="p-3">Setting</th>
            <th className="p-3">Value (JSON)</th>
            <th className="p-3">Default</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {q.data!.settings.map((s) => {
            const draft = drafts[s.key] ?? JSON.stringify(s.value);
            const changed = drafts[s.key] !== undefined && drafts[s.key] !== JSON.stringify(s.value);
            return (
              <tr key={s.key} className="border-t border-line">
                <td className="p-3 font-mono text-xs">{s.key}</td>
                <td className="p-3">
                  <input
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                    aria-label={s.key}
                    className="h-8 w-full min-w-40 rounded border border-line bg-input px-2 font-mono text-xs"
                  />
                </td>
                <td className="p-3 font-mono text-xs text-muted">{JSON.stringify(s.defaultValue)}</td>
                <td className="p-3">
                  <Button size="sm" disabled={!changed} onClick={() => save(s)}>
                    Save
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
