import { formatUsd, placeholderLogo, shortAddress } from '@apecam/shared';
import Link from 'next/link';
import { LiveBadge, TokenAvatar, ViewerCount } from '@/components/ui';
import type { FeedItem } from '@/lib/client/api';

/** Soft backdrop in the token's colour, for streams without a thumbnail yet. */
export function tokenBackdrop(ticker: string | null, contract: string) {
  const { hue } = placeholderLogo(ticker, contract);
  return `radial-gradient(120% 90% at 50% 0%, hsl(${hue} 55% 22%) 0%, #0b0b0c 70%)`;
}

export function liveFor(startedAt: string | null) {
  if (!startedAt) return null;
  const min = Math.max(1, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

/** Home card: thumbnail, LIVE, viewers, ticker + logo, market cap, streamer. No chain or launchpad label. */
export function StreamCard({ item }: { item: FeedItem }) {
  const t = item.token;
  const since = liveFor(item.startedAt);
  return (
    <Link
      href={`/t/${t.chain}/${t.contract}?s=${item.streamId}`}
      className="group flex flex-col gap-3 rounded-[20px] border border-line bg-white/[0.025] p-2 transition hover:border-line-strong hover:bg-white/[0.04]"
    >
      <div
        className="relative aspect-video overflow-hidden rounded-[14px] bg-card-solid"
        style={item.thumbnailUrl ? undefined : { background: tokenBackdrop(t.ticker, t.contract) }}
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TokenAvatar logoUrl={t.logoUrl} ticker={t.ticker} contract={t.contract} size={64} />
          </div>
        )}
        <LiveBadge className="absolute left-2.5 top-2.5" />
        <ViewerCount count={item.viewers} className="absolute right-2.5 top-2.5" />
        {since && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-fg-soft backdrop-blur">
            {since}
          </span>
        )}
        {item.thumbnailUrl && (
          <span className="absolute bottom-2 right-2 rounded-full ring-2 ring-black/70">
            <TokenAvatar logoUrl={t.logoUrl} ticker={t.ticker} contract={t.contract} size={28} />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        <p className="truncate font-medium text-fg">{item.title}</p>
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="font-semibold">${t.ticker ?? '???'}</span>
          {t.name && <span className="truncate text-subtle">{t.name}</span>}
        </p>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-subtle">
            {item.streamer.displayName ?? shortAddress(item.streamer.address)}
          </span>
          <span className="shrink-0 font-mono text-fg-soft">
            {formatUsd(t.marketCapUsd)} <span className="text-subtle">MC</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
