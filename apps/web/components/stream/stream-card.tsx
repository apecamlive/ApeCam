import { formatUsd, shortAddress } from '@apecam/shared';
import Link from 'next/link';
import { LiveBadge, TokenAvatar, ViewerCount } from '@/components/ui';
import type { FeedItem } from '@/lib/client/api';

/** Home card: thumbnail, LIVE, ticker + logo, market cap, viewers, streamer. No chain or launchpad label. */
export function StreamCard({ item }: { item: FeedItem }) {
  const t = item.token;
  return (
    <Link
      href={`/t/${t.chain}/${t.contract}?s=${item.streamId}`}
      className="glass group flex flex-col overflow-hidden rounded-card transition hover:-translate-y-0.5 hover:border-line-strong"
    >
      <div className="relative aspect-video bg-card-solid">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TokenAvatar logoUrl={t.logoUrl} ticker={t.ticker} contract={t.contract} size={56} />
          </div>
        )}
        <LiveBadge className="absolute left-2 top-2" />
        <ViewerCount count={item.viewers} className="absolute bottom-2 left-2" />
      </div>
      <div className="flex items-start gap-3 p-3">
        <TokenAvatar logoUrl={t.logoUrl} ticker={t.ticker} contract={t.contract} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold group-hover:text-primary-light">{item.title}</p>
          <p className="flex items-center gap-2 text-sm">
            <span className="font-display font-bold">${t.ticker ?? '???'}</span>
            <span className="text-muted">MC {formatUsd(t.marketCapUsd)}</span>
          </p>
          <p className="truncate text-xs text-subtle">
            {item.streamer.displayName ?? shortAddress(item.streamer.address)}
          </p>
        </div>
      </div>
    </Link>
  );
}
