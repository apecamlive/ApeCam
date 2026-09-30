'use client';

import { formatCompact, formatDuration, shortAddress } from '@apecam/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { Button, CopyButton, cx, EmptyState, ErrorState, Skeleton, Stat, TokenAvatar } from '@/components/ui';
import { MyRewardsSection } from '@/components/rewards/my-rewards';
import { LinkWalletButtons } from '@/components/wallet/link-wallet';
import { api, ApiRequestError } from '@/lib/client/api';

interface PublicProfile {
  user: { id: string; displayName: string | null; avatarUrl: string | null; createdAt: string };
  address: string;
  stats: {
    streams: number;
    tokens: number;
    validMinutes: number;
    earnedRaw: string;
    pendingRaw: string;
    paidRaw: string;
  };
  history: {
    id: string;
    title: string;
    status: string;
    startedAt: string;
    durationSec: number | null;
    peakViewers: number;
    ticker: string | null;
    chain: string;
    contract: string;
    logoUrl: string | null;
  }[];
  payouts: { period: string; amount: string; txHash: string | null; paidAt: string | null }[];
}

/** $APECAM has 18 decimals; rewards are stored raw. */
const apecam = (raw: string) => formatCompact(Number(BigInt(raw) / 10n ** 14n) / 10_000, 2);

export function Profile({ wallet }: { wallet: string }) {
  const { me } = useAuth();
  const q = useQuery({
    queryKey: ['profile', wallet],
    queryFn: () => api<PublicProfile>(`/api/users/${wallet}`),
  });
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) {
    const notFound = q.error instanceof ApiRequestError && q.error.status === 404;
    return notFound ? (
      <EmptyState title="No APECAM profile" body="This wallet has not signed in to APECAM yet." />
    ) : (
      <ErrorState message="Could not load this profile." onRetry={() => q.refetch()} />
    );
  }
  const p = q.data!;
  const isOwner = me?.user?.id === p.user.id;
  const name = p.user.displayName ?? shortAddress(p.address);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <section className="glass flex flex-col gap-4 rounded-panel p-5 sm:flex-row sm:items-center">
        <Avatar url={p.user.avatarUrl} name={name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold">{name}</h1>
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            {shortAddress(p.address, 6)} <CopyButton value={p.address} />
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Minutes streamed" value={formatCompact(p.stats.validMinutes, 1)} />
          <Stat label="$APECAM earned" value={apecam(p.stats.earnedRaw)} accent="emerald" />
          <Stat label="Pending" value={apecam(p.stats.pendingRaw)} />
        </div>
      </section>

      <p className="text-sm text-muted">
        {p.stats.streams} stream{p.stats.streams === 1 ? '' : 's'} · {p.stats.tokens} token
        {p.stats.tokens === 1 ? '' : 's'} · joined {new Date(p.user.createdAt).toLocaleDateString()}
      </p>

      {isOwner && <EditProfile profile={p} />}
      {isOwner && <MyRewardsSection />}

      <section className="glass rounded-card">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Stream history</h2>
        {p.history.length === 0 ? (
          <p className="p-4 text-sm text-muted">No streams yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="tag">
                <tr>
                  <th className="p-3">Token</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Peak viewers</th>
                </tr>
              </thead>
              <tbody>
                {p.history.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="p-3">
                      <Link
                        href={`/t/${h.chain}/${h.contract}`}
                        className="flex items-center gap-2 hover:text-primary-light"
                      >
                        <TokenAvatar logoUrl={h.logoUrl} ticker={h.ticker} contract={h.contract} size={24} />$
                        {h.ticker ?? '?'}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate p-3">
                      {h.title}
                      {h.status === 'live' && <span className="ml-2 text-xs font-bold text-live">LIVE</span>}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs">
                      {new Date(h.startedAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {h.durationSec === null ? '—' : formatDuration(h.durationSec)}
                    </td>
                    <td className="p-3">{h.peakViewers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass rounded-card">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Payouts</h2>
        {p.payouts.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No payouts yet. Stream to Earn payouts start with Sprint 3.
          </p>
        ) : (
          <ul>
            {p.payouts.map((x) => (
              <li key={x.period} className="flex justify-between border-t border-line px-4 py-2 text-sm">
                <span>{x.period}</span>
                <span className="text-emerald-light">{apecam(x.amount)} $APECAM</span>
                {x.txHash && (
                  <a
                    className="font-mono text-xs text-primary-light"
                    href={`https://robinhoodchain.blockscout.com/tx/${x.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shortAddress(x.txHash)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  return url ? (
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/30 font-display text-2xl font-bold"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function EditProfile({ profile }: { profile: PublicProfile }) {
  const { me, refresh } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(profile.user.displayName ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const reload = async () => {
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['profile'] })]);
  };

  async function saveName() {
    setMsg(null);
    try {
      await api('/api/me', { method: 'PATCH', body: { displayName: name.trim() || null } });
      await reload();
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiRequestError ? err.message : 'Could not save' });
    }
  }

  async function uploadAvatar(f: File) {
    setMsg(null);
    const form = new FormData();
    form.set('file', f);
    const res = await fetch('/api/me/avatar', { method: 'POST', body: form });
    const json = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) setMsg({ ok: false, text: json.error?.message ?? 'Upload failed' });
    else {
      await reload();
      setMsg({ ok: true, text: 'Avatar updated.' });
    }
  }

  async function makePayout(id: string) {
    setMsg(null);
    try {
      await api(`/api/me/wallets/${id}`, { method: 'PATCH', body: { payout: true } });
      await reload();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiRequestError ? err.message : 'Could not change payout wallet',
      });
    }
  }

  const hasEvm = me?.wallets.some((w) => w.family === 'evm');
  return (
    <section className="glass flex flex-col gap-4 rounded-card p-4">
      <h2 className="font-semibold">Edit profile</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="Display name"
          aria-label="Display name"
          className="h-10 min-w-0 flex-1 rounded-card border border-line bg-input px-3 text-sm focus:border-primary focus:outline-none"
        />
        <Button onClick={saveName}>Save name</Button>
        <Button variant="ghost" onClick={() => file.current?.click()}>
          Upload avatar
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="tag">Wallets · payout wallet receives Stream to Earn $APECAM</p>
        {me?.wallets.map((w) => (
          <div
            key={w.id}
            className="flex items-center gap-3 rounded-card border border-line px-3 py-2 text-sm"
          >
            <span className="tag w-14">{w.family === 'solana' ? 'Solana' : 'EVM'}</span>
            <span className="font-mono">{shortAddress(w.address, 6)}</span>
            {w.source === 'embedded' && <span className="text-xs text-muted">APECAM wallet</span>}
            {w.family === 'evm' ? (
              <button
                onClick={() => makePayout(w.id)}
                disabled={w.isPayout}
                className={cx(
                  'ml-auto rounded-full px-3 py-1 text-xs',
                  w.isPayout ? 'bg-emerald/20 text-emerald-light' : 'bg-white/10 hover:bg-white/20',
                )}
              >
                {w.isPayout ? '✓ Payout wallet' : 'Use for payouts'}
              </button>
            ) : (
              <span className="ml-auto text-xs text-subtle">cannot receive $APECAM</span>
            )}
          </div>
        ))}
        {!hasEvm && (
          <p className="text-xs text-warning">
            $APECAM is paid on Robinhood Chain. Link an EVM wallet to receive rewards.
          </p>
        )}
        <LinkWalletButtons />
      </div>
      {msg && <p className={cx('text-sm', msg.ok ? 'text-emerald-light' : 'text-live')}>{msg.text}</p>}
    </section>
  );
}
