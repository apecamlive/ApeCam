'use client';

import { formatCompact } from '@apecam/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { StreamCard } from '@/components/stream/stream-card';
import { Button, EmptyState, ErrorState, Skeleton, Tabs } from '@/components/ui';
import { api, tokens18, type FeedItem, type TrackerSummary } from '@/lib/client/api';

type Tab = 'live' | 'trending' | 'new';
const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Live Now' },
  { id: 'trending', label: 'Trending' },
  { id: 'new', label: 'Just Live' },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('live');
  // S3-11: same numbers as /burn; stays "coming soon" until the tracker is configured.
  const tracker = useQuery({
    queryKey: ['tracker-summary'],
    queryFn: () => api<TrackerSummary>('/api/tracker/summary'),
    retry: false,
    staleTime: 60_000,
  });
  const feed = useInfiniteQuery({
    queryKey: ['feed', tab],
    queryFn: ({ pageParam }) =>
      api<{ items: FeedItem[]; nextCursor: number | null }>(
        `/api/streams/live?tab=${tab}&cursor=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10_000,
  });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage(),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  return (
    <div className="flex flex-col gap-6">
      <section className="glass flex flex-col gap-4 rounded-panel p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="tag">// decentralized tokenized livestream</p>
          <h1 className="font-display text-3xl font-black md:text-4xl">
            Hold it. <span className="text-primary-light">Stream it.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            One stage for every token, from any launchpad, on any chain.
          </p>
        </div>
        <Link href="/go-live">
          <Button variant="white" size="lg">
            Go Live
          </Button>
        </Link>
      </section>

      <Link
        href="/burn"
        className="glass flex items-center justify-between rounded-card px-4 py-2 text-sm hover:bg-card-hover"
      >
        <span className="tag">$APECAM bought back / burned</span>
        <span className="font-mono text-muted">
          {tracker.data
            ? `${formatCompact(tokens18(tracker.data.boughtBackRaw), 1)} / ${formatCompact(tokens18(tracker.data.burnedRaw), 1)} (${tracker.data.burnedPercent.toFixed(2)}%) →`
            : 'tracker coming soon →'}
        </span>
      </Link>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {feed.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3.4]" />
          ))}
        </div>
      ) : feed.isError ? (
        <ErrorState message="Could not load live streams." onRetry={() => feed.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nobody is live yet"
          body="Hold $100 of any token and be the first on stage."
          action={
            <Link href="/go-live">
              <Button variant="primary">Go Live</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <StreamCard key={item.streamId} item={item} />
          ))}
        </div>
      )}
      <div ref={sentinel} />
    </div>
  );
}
