'use client';

import { formatCompact, formatUsd, shortAddress } from '@apecam/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CopyButton, ErrorState, Skeleton, Tabs } from '@/components/ui';
import {
  api,
  ApiRequestError,
  tokens18,
  type BurnRow,
  type BuybackRow,
  type TrackerSummary,
} from '@/lib/client/api';

const EXPLORER = 'https://robinhoodchain.blockscout.com';
const WALLET_LABELS: Record<TrackerSummary['wallets'][number]['role'], { title: string; hint: string }> = {
  creatorFee: { title: 'Creator fee', hint: 'Receives the Pons creator fee' },
  operations: { title: 'Operations', hint: '50%: servers, RPC, moderation' },
  buyback: { title: 'Buyback', hint: '30%: buys $APECAM back daily' },
  burn: { title: 'Burn', hint: 'Tokens sent here are gone forever' },
  treasury: { title: 'Treasury', hint: '20%: Stream to Earn rewards' },
};

function ago(iso: string | null) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function BurnTracker() {
  const summary = useQuery({
    queryKey: ['tracker-summary'],
    queryFn: () => api<TrackerSummary>('/api/tracker/summary'),
    refetchInterval: 60_000,
    // "Not configured yet" will not fix itself on retry; other failures get one retry.
    retry: (count, err) =>
      count < 1 && !(err instanceof ApiRequestError && err.code === 'TRACKER_NOT_CONFIGURED'),
  });

  if (summary.isPending) return <Skeleton className="h-96" />;
  if (summary.isError) {
    const notReady =
      summary.error instanceof ApiRequestError && summary.error.code === 'TRACKER_NOT_CONFIGURED';
    return notReady ? (
      <section className="corner-marks rounded-panel border border-line bg-gradient-to-b from-white/[0.035] to-white/[0.01] px-6 py-14 md:px-12">
        <p className="tag">Burn &amp; buyback tracker</p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-[0.95] md:text-6xl">
          Bought back.
          <br />
          <span className="text-fade">Burned. On-chain.</span>
        </h1>
        <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-muted">
          The tracker goes live as soon as $APECAM is deployed and its wallets are published. Every number
          here will come straight from Robinhood Chain: 30% of the creator fee buys back $APECAM and sends it
          to the burn address, 20% funds Stream to Earn.
        </p>
        <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
          {['Bought back', 'Burned', 'Treasury'].map((label) => (
            <div key={label} className="rounded-2xl border border-line bg-black/30 p-4">
              <p className="tag">{label}</p>
              <p className="mt-2 font-display text-2xl font-semibold text-subtle">—</p>
            </div>
          ))}
        </div>
      </section>
    ) : (
      <ErrorState message="Could not load the tracker." onRetry={() => summary.refetch()} />
    );
  }
  const s = summary.data!;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="tag">// every number read from Robinhood Chain</p>
        <h1 className="font-display text-3xl font-black md:text-4xl">
          $APECAM <span className="text-live">burned</span> & bought back
        </h1>
        <p className="text-sm text-muted">
          Last synced {ago(s.lastSyncedAt)}
          {s.syncedToBlock !== null && <> · block {s.syncedToBlock.toLocaleString()}</>}
          {!s.burnIndexMatchesChain && (
            <span className="ml-2 text-warning">· indexing catching up with chain</span>
          )}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat
          label="Total burned"
          value={formatCompact(tokens18(s.burnedRaw), 2)}
          sub={`${s.burnedPercent.toFixed(2)}% of supply`}
          tone="live"
        />
        <BigStat
          label="Bought back"
          value={formatCompact(tokens18(s.boughtBackRaw), 2)}
          sub={`${formatUsd(s.boughtBackUsd)} at indexing time`}
        />
        <BigStat
          label="Circulating supply"
          value={formatCompact(tokens18(s.circulatingRaw), 2)}
          sub={`of ${formatCompact(tokens18(s.totalSupplyRaw), 2)} total`}
        />
        <BigStat
          label="Treasury (Stream to Earn)"
          value={formatCompact(tokens18(s.treasuryRaw), 2)}
          sub={`${formatCompact(tokens18(s.paidOutRaw), 2)} paid to streamers`}
          tone="emerald"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="glass rounded-card p-4 text-sm">
          <p className="tag">Last buyback</p>
          <p className="font-semibold">{ago(s.lastBuybackAt)}</p>
        </div>
        <div className="glass rounded-card p-4 text-sm">
          <p className="tag">Last burn</p>
          <p className="font-semibold">{ago(s.lastBurnAt)}</p>
        </div>
      </section>

      <DailyChart />
      <Tables />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold">Wallets</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[{ role: 'contract', address: s.contract, balanceRaw: null } as const, ...s.wallets].map((w) => {
            const label =
              w.role === 'contract'
                ? { title: '$APECAM contract', hint: 'Token on Robinhood Chain' }
                : WALLET_LABELS[w.role];
            return (
              <div key={w.role} className="glass flex flex-col gap-1 rounded-card p-4 text-sm">
                <p className="font-semibold">{label.title}</p>
                <p className="text-xs text-muted">{label.hint}</p>
                <p className="flex items-center gap-2 font-mono text-xs">
                  <a
                    href={`${EXPLORER}/address/${w.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-light hover:underline"
                  >
                    {shortAddress(w.address, 6)}
                  </a>
                  <CopyButton value={w.address} />
                </p>
                {w.balanceRaw !== null && (
                  <p className="text-xs">Balance: {formatCompact(tokens18(w.balanceRaw), 2)} $APECAM</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'live' | 'emerald';
}) {
  return (
    <div className="glass flex flex-col gap-1 rounded-card p-4">
      <p className="tag">{label}</p>
      <p
        className={`font-display text-3xl font-black ${tone === 'live' ? 'text-live' : tone === 'emerald' ? 'text-emerald-light' : ''}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

function DailyChart() {
  const q = useQuery({
    queryKey: ['tracker-daily'],
    queryFn: () =>
      api<{ days: { day: string; buybackRaw: string; burnRaw: string }[] }>('/api/tracker/daily?days=90'),
  });
  const days = q.data?.days ?? [];
  const max = Math.max(1, ...days.flatMap((d) => [tokens18(d.buybackRaw), tokens18(d.burnRaw)]));
  return (
    <section className="glass rounded-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Daily buyback & burn</h2>
        <p className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-primary-light" />
            bought back
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-live" />
            burned
          </span>
        </p>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : days.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No buybacks or burns yet.</p>
      ) : (
        <div
          className="flex h-40 items-end gap-1 overflow-x-auto"
          role="img"
          aria-label={`Daily buyback and burn for the last ${days.length} days`}
        >
          {days.map((d) => (
            <div
              key={d.day}
              className="flex h-full min-w-3 flex-1 items-end gap-px"
              title={`${d.day}: bought ${formatCompact(tokens18(d.buybackRaw))}, burned ${formatCompact(tokens18(d.burnRaw))}`}
            >
              <div
                className="w-1/2 rounded-t bg-primary-light"
                style={{ height: `${(tokens18(d.buybackRaw) / max) * 100}%` }}
              />
              <div
                className="w-1/2 rounded-t bg-live"
                style={{ height: `${(tokens18(d.burnRaw) / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Tables() {
  const [tab, setTab] = useState<'buybacks' | 'burns'>('buybacks');
  return (
    <section className="flex flex-col gap-3">
      <Tabs
        tabs={[
          { id: 'buybacks', label: 'Buybacks' },
          { id: 'burns', label: 'Burns' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'buybacks' ? <BuybackTable /> : <BurnTable />}
    </section>
  );
}

function usePaged<T>(key: string, path: string) {
  return useInfiniteQuery({
    queryKey: [key],
    queryFn: ({ pageParam }) => api<{ items: T[]; nextCursor: number | null }>(`${path}?cursor=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
  });
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-primary-light hover:underline"
    >
      {shortAddress(hash, 6)}
    </a>
  );
}

function BuybackTable() {
  const q = usePaged<BuybackRow>('tracker-buybacks', '/api/tracker/buybacks');
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Skeleton className="h-40" />;
  if (!rows.length) return <p className="glass rounded-card p-4 text-sm text-muted">No buybacks yet.</p>;
  return (
    <div className="glass overflow-x-auto rounded-card">
      <table className="w-full text-left text-sm">
        <thead className="tag">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">$APECAM bought</th>
            <th className="p-3">Spent</th>
            <th className="p-3">USD value</th>
            <th className="p-3">Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.txHash}:${r.logIndex}`} className="border-t border-line">
              <td className="whitespace-nowrap p-3 text-xs">{new Date(r.boughtAt).toLocaleString()}</td>
              <td className="p-3">{formatCompact(tokens18(r.apecamAmount), 2)}</td>
              <td className="p-3">
                {formatCompact(tokens18(r.spentAmount), 4)} {r.spentAsset}
              </td>
              <td className="p-3">{formatUsd(r.usdValue)}</td>
              <td className="p-3">
                <TxLink hash={r.txHash} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.hasNextPage && (
        <button
          className="w-full border-t border-line p-3 text-sm text-muted hover:text-fg"
          onClick={() => q.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </div>
  );
}

function BurnTable() {
  const q = usePaged<BurnRow>('tracker-burns', '/api/tracker/burns');
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <Skeleton className="h-40" />;
  if (!rows.length) return <p className="glass rounded-card p-4 text-sm text-muted">No burns yet.</p>;
  return (
    <div className="glass overflow-x-auto rounded-card">
      <table className="w-full text-left text-sm">
        <thead className="tag">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">$APECAM burned</th>
            <th className="p-3">USD value</th>
            <th className="p-3">From</th>
            <th className="p-3">Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.txHash}:${r.logIndex}`} className="border-t border-line">
              <td className="whitespace-nowrap p-3 text-xs">{new Date(r.burnedAt).toLocaleString()}</td>
              <td className="p-3 text-live">{formatCompact(tokens18(r.amount), 2)}</td>
              <td className="p-3">{formatUsd(r.usdValue)}</td>
              <td className="p-3 font-mono text-xs">{shortAddress(r.fromAddress)}</td>
              <td className="p-3">
                <TxLink hash={r.txHash} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {q.hasNextPage && (
        <button
          className="w-full border-t border-line p-3 text-sm text-muted hover:text-fg"
          onClick={() => q.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </div>
  );
}
