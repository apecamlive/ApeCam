'use client';

import { formatCompact, formatUsd, shortAddress } from '@apecam/shared';
import Link from 'next/link';
import { liveFor } from '@/components/stream/stream-card';
import { TokenAvatar } from '@/components/ui';
import type { FeedItem } from '@/lib/client/api';

/** Scrolling strip of everything live right now. Pauses on hover; still under reduced motion. */
export function LiveMarquee({ streams }: { streams: FeedItem[] }) {
  if (streams.length < 3) return null;
  // Two copies so the loop is seamless (the animation moves exactly one copy's width).
  const loop = [...streams, ...streams];
  return (
    <section aria-label="Live now" className="group relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
      <ul
        className="flex w-max gap-3 [animation:marquee_60s_linear_infinite] group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${Math.max(30, streams.length * 8)}s` }}
      >
        {loop.map((s, i) => (
          <li key={`${s.streamId}-${i}`} aria-hidden={i >= streams.length ? true : undefined}>
            <Link
              href={`/t/${s.token.chain}/${s.token.contract}?s=${s.streamId}`}
              tabIndex={i >= streams.length ? -1 : 0}
              className="flex w-64 items-center gap-3 rounded-2xl border border-line bg-white/[0.025] p-3 transition hover:border-line-strong"
            >
              <TokenAvatar
                logoUrl={s.token.logoUrl}
                ticker={s.token.ticker}
                contract={s.token.contract}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2 text-[11px] text-subtle">
                  <span className="truncate">
                    {s.streamer.displayName ?? shortAddress(s.streamer.address)}
                  </span>
                  <span className="shrink-0 font-mono">{liveFor(s.startedAt)}</span>
                </p>
                <p className="truncate text-sm font-medium">
                  {s.title} <span className="text-subtle">${s.token.ticker ?? '?'}</span>
                </p>
                <p className="font-mono text-[11px] text-fg-soft">
                  {formatUsd(s.token.marketCapUsd)} <span className="text-subtle">MC</span> ·{' '}
                  {formatCompact(s.viewers, 1)} <span className="text-subtle">watching</span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
