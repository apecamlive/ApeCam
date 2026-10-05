'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bento } from '@/components/home/bento';
import { Hero } from '@/components/home/hero';
import { LiveMarquee } from '@/components/home/marquee';
import { StreamCard } from '@/components/stream/stream-card';
import { Button, EmptyState, ErrorState, Skeleton, Tabs } from '@/components/ui';
import { api, type FeedItem, type TrackerSummary } from '@/lib/client/api';
import { usePublicConfig } from '@/lib/client/public-config';

type Tab = 'live' | 'trending' | 'new';
const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Live Now' },
  { id: 'trending', label: 'Trending' },
  { id: 'new', label: 'Just Live' },
];

type FeedPage = { items: FeedItem[]; nextCursor: number | null };

export default function Home() {
  const [tab, setTab] = useState<Tab>('live');
  const config = usePublicConfig().data;
  // S3-11: same numbers as /burn; "soon" until the tracker is configured.
  const tracker = useQuery({
    queryKey: ['tracker-summary'],
    queryFn: () => api<TrackerSummary>('/api/tracker/summary'),
    retry: false,
    staleTime: 60_000,
  });
  // Top streams for the hero fan and the marquee, independent of the selected tab.
  const top = useQuery({
    queryKey: ['feed-top'],
    queryFn: () => api<FeedPage>('/api/streams/live?tab=live'),
    refetchInterval: 15_000,
  });
  const feed = useInfiniteQuery({
    queryKey: ['feed', tab],
    queryFn: ({ pageParam }) => api<FeedPage>(`/api/streams/live?tab=${tab}&cursor=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 10_000,
  });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const topItems = top.data?.items ?? [];

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
    <div className="flex flex-col gap-8">
      <Hero streams={topItems} minUsd={config?.goLiveMinUsd ?? 100} />
      <LiveMarquee streams={topItems} />
      <Bento tracker={tracker.data} config={config} liveCount={topItems.length} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-semibold">Live streams</h2>
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
          </div>
          {topItems.length > 0 && (
            <span className="inline-flex items-center gap-2 text-sm text-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-live [animation:live-pulse_1.4s_infinite]" />
              {topItems.length} live now
            </span>
          )}
        </div>

        {feed.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3.6] rounded-[20px]" />
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
                <Button variant="white">Go Live</Button>
              </Link>
            }
          />
        ) : (
          <div data-testid="feed" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <StreamCard key={item.streamId} item={item} />
            ))}
          </div>
        )}
        <div ref={sentinel} />
      </section>
    </div>
  );
}
