'use client';

import { shortAddress } from '@apecam/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, cx, ErrorState, Modal, Skeleton } from '@/components/ui';
import { api, ApiRequestError, type GoLiveMode } from '@/lib/client/api';

interface Invite {
  address: string;
  note: string | null;
  createdAt: string;
  signedUp: boolean;
}

const MODES: { id: GoLiveMode; label: string; help: string }[] = [
  { id: 'open', label: 'Open', help: 'Every wallet that holds $100 of a token can go live.' },
  { id: 'invite', label: 'Invite only', help: 'Closed beta: invited wallets and staff only.' },
  { id: 'closed', label: 'Closed', help: 'Emergency: nobody can start a stream. Watching still works.' },
];

/** Closed-beta invites + the emergency "close Go Live" button (Sprint 5). Moderators and admins. */
export function GoLiveTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-go-live'],
    queryFn: () => api<{ mode: GoLiveMode; invites: Invite[] }>('/api/admin/go-live'),
  });
  const [pending, setPending] = useState<GoLiveMode | null>(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin-go-live'] }),
      qc.invalidateQueries({ queryKey: ['public-config'] }),
      qc.invalidateQueries({ queryKey: ['admin-live'] }),
    ]);

  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message="Could not load Go Live settings." onRetry={() => q.refetch()} />;
  const { mode, invites } = q.data!;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Who can go live</h2>
        <div role="radiogroup" aria-label="Go Live access" className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => mode !== m.id && setPending(m.id)}
              className={cx(
                'rounded-card border p-4 text-left text-sm transition',
                mode === m.id
                  ? m.id === 'closed'
                    ? 'border-live bg-live/15'
                    : 'border-primary bg-primary/15'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span className="block font-semibold">{m.label}</span>
              <span className="text-xs text-muted">{m.help}</span>
            </button>
          ))}
        </div>
        {mode !== 'closed' && (
          <div>
            <Button variant="danger" onClick={() => setPending('closed')}>
              Emergency: close Go Live
            </Button>
          </div>
        )}
      </section>

      <InviteSection invites={invites} onChange={refresh} />

      <ModeDialog
        from={mode}
        to={pending}
        onClose={() => setPending(null)}
        onDone={async () => {
          setPending(null);
          await refresh();
        }}
      />
    </div>
  );
}

function ModeDialog({
  from,
  to,
  onClose,
  onDone,
}: {
  from: GoLiveMode;
  to: GoLiveMode | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [endLive, setEndLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!to) return null;
  const label = MODES.find((m) => m.id === to)!.label;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/go-live', { body: { mode: to, reason, endLive: to === 'closed' && endLive } });
      setReason('');
      setEndLive(false);
      await onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change Go Live access');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Set Go Live to “${label}”?`}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-fg-soft">
          From “{MODES.find((m) => m.id === from)!.label}”. Takes effect immediately for new streams and is
          posted to the alert channel.
        </p>
        {to === 'closed' && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={endLive}
              onChange={(e) => setEndLive(e.target.checked)}
              className="mt-1"
            />
            <span>Also end every stream that is live right now</span>
          </label>
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
          <Button
            variant={to === 'closed' ? 'danger' : 'primary'}
            disabled={busy || !reason.trim()}
            onClick={confirm}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InviteSection({ invites, onChange }: { invites: Invite[]; onChange: () => Promise<unknown> }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setResult(null);
    try {
      const addresses = text.split(/[\s,]+/).filter(Boolean);
      const res = await api<{ invited: string[]; invalid: string[] }>('/api/admin/go-live/invites', {
        body: { addresses, note: note || undefined },
      });
      setResult(
        `${res.invited.length} invited` +
          (res.invalid.length ? ` · not a wallet: ${res.invalid.join(', ')}` : ''),
      );
      setText('');
      await onChange();
    } catch (err) {
      setResult(err instanceof ApiRequestError ? err.message : 'Could not invite');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(address: string) {
    await api(`/api/admin/go-live/invites/${address}`, { method: 'DELETE' }).catch(() => undefined);
    await onChange();
  }

  const joined = invites.filter((i) => i.signedUp).length;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold">
        Beta invites{' '}
        <span className="text-sm font-normal text-muted">
          {invites.length} invited · {joined} signed in
        </span>
      </h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Wallet addresses (EVM or Solana), one per line"
        aria-label="Wallet addresses to invite"
        className="rounded-card border border-line bg-input p-3 font-mono text-xs focus:border-primary focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Note, e.g. Pons community"
          aria-label="Invite note"
          className="h-10 min-w-0 flex-1 rounded-card border border-line bg-input px-3 text-sm focus:border-primary focus:outline-none"
        />
        <Button variant="primary" disabled={busy || !text.trim()} onClick={add}>
          {busy ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
      {result && (
        <p role="status" className="text-sm text-fg-soft">
          {result}
        </p>
      )}
      {invites.length > 0 && (
        <div className="glass overflow-x-auto rounded-card">
          <table className="w-full text-left text-sm">
            <thead className="tag">
              <tr>
                <th className="p-3">Wallet</th>
                <th className="p-3">Note</th>
                <th className="p-3">Signed in</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.address} className="border-t border-line">
                  <td className="p-3 font-mono text-xs" title={i.address}>
                    {shortAddress(i.address, 6)}
                  </td>
                  <td className="p-3 text-xs text-fg-soft">{i.note}</td>
                  <td className="p-3 text-xs">{i.signedUp ? 'yes' : 'not yet'}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => revoke(i.address)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
