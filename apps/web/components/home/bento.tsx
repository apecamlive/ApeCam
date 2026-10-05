'use client';

import { formatCompact } from '@apecam/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { tokens18, type PublicConfig, type TrackerSummary } from '@/lib/client/api';

function Tile({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between gap-4 rounded-[22px] border border-line bg-white/[0.025] p-3 transition hover:border-line-strong ${className ?? ''}`}
    >
      <div className="flex-1 rounded-[16px] border border-line bg-black/30 p-4">{children}</div>
      <div className="flex items-center justify-between px-1.5 pb-0.5 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-subtle transition group-hover:text-fg">
          Open <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  );
}

/** Three entry points under the hero: burn tracker, Stream to Earn, how to go live. */
export function Bento({
  tracker,
  config,
  liveCount,
}: {
  tracker: TrackerSummary | undefined;
  config: PublicConfig | undefined;
  liveCount: number;
}) {
  const tiers = config?.s2e.tiers ?? [];
  const max = tiers.at(-1)?.[1] ?? 1;
  return (
    <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Tile href="/burn" label="Burn tracker">
        <p className="tag">$APECAM burned</p>
        {tracker ? (
          <>
            <p className="mt-2 font-display text-4xl font-semibold">{tracker.burnedPercent.toFixed(2)}%</p>
            <p className="mt-1 text-sm text-muted">
              {formatCompact(tokens18(tracker.burnedRaw), 1)} burned ·{' '}
              {formatCompact(tokens18(tracker.boughtBackRaw), 1)} bought back
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-4xl font-semibold text-subtle">Soon</p>
            <p className="mt-1 text-sm text-muted">Every buyback and burn, on-chain and public.</p>
          </>
        )}
      </Tile>

      <Tile href="/about" label="Stream to Earn">
        <p className="tag">$APECAM per day</p>
        <div className="mt-3 flex h-20 items-end gap-2" aria-hidden="true">
          {tiers.map(([min, amount]) => (
            <div key={min} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-white/10 to-white/60"
                style={{ height: `${Math.max(12, (amount / max) * 64)}px` }}
              />
              <span className="font-mono text-[10px] text-subtle">{min}m</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          Up to {formatCompact(config?.s2e.dailyCap ?? 0, 0)} a day with {config?.s2e.minViewers ?? 3}+ real
          viewers.
        </p>
      </Tile>

      <Tile href="/go-live" label="Go Live" className="md:col-span-2 lg:col-span-1">
        <p className="tag">How it works</p>
        <ol className="mt-3 flex flex-col gap-2.5 text-sm">
          {[
            ['Connect', 'Sign a message. Never a transaction.'],
            ['Hold', `$${config?.goLiveMinUsd ?? 100} of the token you want to stream.`],
            ['Go Live', `Camera or screen, from the browser. ${liveCount} live now.`],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[10px]">
                {i + 1}
              </span>
              <span>
                <span className="font-medium">{title}</span> <span className="text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Tile>
    </section>
  );
}
