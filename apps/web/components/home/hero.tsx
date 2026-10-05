'use client';

import { formatCompact } from '@apecam/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { liveFor, tokenBackdrop } from '@/components/stream/stream-card';
import { Button, cx, TokenAvatar } from '@/components/ui';
import type { FeedItem } from '@/lib/client/api';

const LAUNCHPADS = ['Pons', 'Pump.fun', 'Flap'];

/**
 * Home hero (reference: cashed.money): editorial headline on the left, a fanned stack of the top live
 * streams on the right that rotates every few seconds.
 */
export function Hero({ streams, minUsd }: { streams: FeedItem[]; minUsd: number }) {
  return (
    <section className="corner-marks overflow-hidden rounded-panel border border-line bg-gradient-to-b from-white/[0.035] to-white/[0.01]">
      <div className="grid items-center gap-10 px-6 py-12 md:px-12 md:py-16 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="tag">Decentralized tokenized livestream</p>
          <h1 className="font-display text-5xl font-semibold leading-[0.95] md:text-7xl">
            Hold it.
            <br />
            <span className="text-fade">Stream it.</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="tag">Your bag is your mic</span>
            <span className="h-px w-10 bg-line-strong" />
          </div>
          <p className="max-w-md text-[15px] leading-relaxed text-muted">
            Hold ${minUsd} of any token and go live for it, straight from the browser. Tokens from{' '}
            {LAUNCHPADS.map((l) => (
              <span
                key={l}
                className="mx-0.5 inline-flex rounded-full border border-line px-2 py-px text-xs text-fg-soft"
              >
                {l}
              </span>
            ))}{' '}
            and every other launchpad share one stage. Stream to earn $APECAM.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/go-live">
              <Button variant="white" size="lg" className="h-11 px-5 text-[15px]">
                <span className="h-2 w-2 rounded-full bg-live-strong" aria-hidden="true" />
                Go Live
              </Button>
            </Link>
            <Link href="/about">
              <Button size="lg" className="h-11 px-5 text-[15px]">
                How it works <span aria-hidden="true">→</span>
              </Button>
            </Link>
          </div>
        </div>
        <FannedStreams streams={streams} />
      </div>
    </section>
  );
}

function FannedStreams({ streams }: { streams: FeedItem[] }) {
  const top = streams.slice(0, 8);
  const [i, setI] = useState(0);
  const n = top.length;

  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 5000);
    return () => clearInterval(id);
  }, [n]);

  if (!n) return <PlaceholderFan />;
  const at = (offset: number) => top[(i + offset + n) % n]!;
  const slots = n >= 3 ? [-1, 1, 0] : n === 2 ? [1, 0] : [0]; // the centre card renders last (on top)

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-[300px] w-full max-w-[460px]">
        {slots.map((offset) => (
          <FanCard
            key={`${offset}-${at(offset).streamId}`}
            item={at(offset)}
            offset={offset}
            index={(i + offset + n) % n}
          />
        ))}
      </div>
      {n > 1 && (
        <div className="flex w-full max-w-[460px] items-center justify-between text-xs text-subtle">
          <span className="font-mono">
            <span className="text-fg">{String(i + 1).padStart(2, '0')}</span> / {String(n).padStart(2, '0')}
          </span>
          <div className="flex gap-1.5">
            <PagerButton
              label="Previous stream"
              onClick={() => setI((x) => (x - 1 + n) % n)}
              d="M15 18l-6-6 6-6"
            />
            <PagerButton label="Next stream" onClick={() => setI((x) => (x + 1) % n)} d="M9 18l6-6-6-6" />
          </div>
        </div>
      )}
    </div>
  );
}

function PagerButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-fg"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </button>
  );
}

const SLOT_STYLE: Record<number, string> = {
  [-1]: 'translate-x-[-108%] translate-y-4 rotate-[-9deg] scale-[0.9] opacity-60',
  0: 'translate-x-[-50%] rotate-0 z-10',
  1: 'translate-x-[8%] translate-y-4 rotate-[9deg] scale-[0.9] opacity-60',
};

function FanCard({ item, offset, index }: { item: FeedItem; offset: number; index: number }) {
  const t = item.token;
  const centre = offset === 0;
  return (
    <Link
      href={`/t/${t.chain}/${t.contract}?s=${item.streamId}`}
      tabIndex={centre ? 0 : -1}
      aria-hidden={centre ? undefined : true}
      className={cx(
        'absolute left-1/2 top-0 flex h-[290px] w-[220px] flex-col rounded-[22px] border border-line-strong p-4 shadow-2xl shadow-black/70 transition-all duration-700',
        SLOT_STYLE[offset],
        !centre && 'pointer-events-none',
      )}
      style={{ background: tokenBackdrop(t.ticker, t.contract) }}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-fg">
          <span className="h-1.5 w-1.5 rounded-full bg-live [animation:live-pulse_1.4s_infinite]" />
          LIVE {liveFor(item.startedAt) ?? ''}
        </span>
        <span className="font-mono text-[10px] text-subtle">{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <span className="rounded-full p-1 ring-1 ring-white/20">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <TokenAvatar logoUrl={t.logoUrl} ticker={t.ticker} contract={t.contract} size={96} />
          )}
        </span>
      </div>
      <p className="truncate text-center text-sm text-fg-soft">{item.title}</p>
      <p className="mt-1 text-center font-display text-2xl font-semibold">
        ${t.ticker ?? '???'}{' '}
        <span className="text-sm font-normal text-subtle">{formatCompact(item.viewers, 1)} watching</span>
      </p>
    </Link>
  );
}

/** Before anyone is live: the same fan, as an invitation. */
function PlaceholderFan() {
  return (
    <div className="relative h-[300px] w-full max-w-[460px] justify-self-center">
      {[-1, 1, 0].map((offset) => (
        <div
          key={offset}
          className={cx(
            'absolute left-1/2 top-0 flex h-[290px] w-[220px] flex-col items-center justify-center gap-3 rounded-[22px] border border-line-strong bg-card-solid p-4 text-center shadow-2xl shadow-black/70',
            SLOT_STYLE[offset],
          )}
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-line-strong font-display text-3xl text-subtle">
            $?
          </span>
          {offset === 0 && (
            <>
              <p className="text-sm text-fg-soft">Your token, live.</p>
              <p className="tag">Be the first on stage</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
