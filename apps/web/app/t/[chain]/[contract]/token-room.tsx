'use client';

import { formatDuration, formatPercent, formatPrice, formatUsd, shortAddress } from '@apecam/shared';
import { LiveKitRoom } from '@livekit/components-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { ChatPanel, LiveChatFeed } from '@/components/chat/chat-panel';
import { StreamVideo } from '@/components/stream/player';
import {
  Button,
  CopyButton,
  cx,
  EmptyState,
  ErrorState,
  LiveBadge,
  Skeleton,
  TokenAvatar,
  ViewerCount,
} from '@/components/ui';
import { api, ApiRequestError, type ChatMessage, type TokenPage } from '@/lib/client/api';

export function TokenRoom({ chain, contract }: { chain: string; contract: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const page = useQuery({
    queryKey: ['token', chain, contract],
    queryFn: () => api<TokenPage>(`/api/tokens/${chain}/${contract}`),
    refetchInterval: 15_000,
  });

  if (page.isLoading) return <Skeleton className="h-[480px]" />;
  if (page.isError) {
    const notFound = page.error instanceof ApiRequestError && page.error.status === 404;
    return (
      <ErrorState
        message={notFound ? 'Token not found on this chain.' : 'Could not load this token.'}
        onRetry={() => page.refetch()}
      />
    );
  }
  const { token, streams } = page.data!;
  const selected = streams.find((s) => s.id === params.get('s')) ?? streams[0];

  return (
    <div className="flex flex-col gap-4">
      <TokenHeader token={token} />
      {streams.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Streamers">
          {streams.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === selected?.id}
              onClick={() => router.replace(`?s=${s.id}`, { scroll: false })}
              className={cx(
                'glass shrink-0 rounded-full px-3 py-1.5 text-sm',
                s.id === selected?.id && 'border-primary bg-primary/20',
              )}
            >
              {s.streamer.displayName ?? shortAddress(s.streamer.address)} · {s.viewers}
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <StreamStage key={selected.id} stream={selected} />
      ) : (
        <EmptyState
          title="Nobody is live for this token"
          body={`Hold $100 of $${token.ticker ?? 'this token'}? Go live.`}
          action={
            <Link href={`/go-live?chain=${token.chain}&contract=${token.contract}`}>
              <Button variant="primary">Go Live</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}

function TokenHeader({ token }: { token: TokenPage['token'] }) {
  const change = token.change24h === null ? null : Number(token.change24h);
  return (
    <section className="glass flex flex-col gap-4 rounded-panel p-4 md:flex-row md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <TokenAvatar logoUrl={token.logoUrl} ticker={token.ticker} contract={token.contract} size={48} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">${token.ticker ?? '???'}</h1>
          <p className="truncate text-sm text-muted">{token.name}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-card bg-black/30 px-3 py-2">
        <span className="tag shrink-0">CA</span>
        <span className="hidden truncate font-mono text-xs md:inline">{token.contract}</span>
        <span className="font-mono text-xs md:hidden">{shortAddress(token.contract, 6)}</span>
        <CopyButton value={token.contract} />
      </div>
      <div className="flex flex-wrap items-center gap-4 md:ml-auto">
        <div>
          <p className="tag">Mcap</p>
          <p className="font-semibold">{formatUsd(token.marketCapUsd)}</p>
        </div>
        <div>
          <p className="tag">Price</p>
          <p className="font-semibold">{formatPrice(token.priceUsd)}</p>
        </div>
        <div>
          <p className="tag">24h</p>
          <p
            className={cx(
              'font-semibold',
              change !== null && (change >= 0 ? 'text-emerald-light' : 'text-live'),
            )}
          >
            {formatPercent(change)}
          </p>
        </div>
        {token.chartUrl && (
          <a href={token.chartUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm">Chart</Button>
          </a>
        )}
        {token.buyUrl && (
          <a href={token.buyUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="white">
              Buy
            </Button>
          </a>
        )}
      </div>
    </section>
  );
}

function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return startedAt ? (now - new Date(startedAt).getTime()) / 1000 : 0;
}

function StreamStage({ stream }: { stream: TokenPage['streams'][number] }) {
  const { signedIn } = useAuth();
  const elapsed = useElapsed(stream.startedAt);
  const [live, setLive] = useState<ChatMessage[]>([]);
  const onMessage = useCallback((m: ChatMessage) => setLive((prev) => [...prev.slice(-199), m]), []);
  // Token identity depends on the session (u_… vs a_…), so refetch it when the user signs in.
  const viewer = useQuery({
    queryKey: ['view-token', stream.id, signedIn],
    queryFn: () =>
      api<{ token: string; wsUrl: string; blurred: boolean }>(`/api/streams/${stream.id}/view-token`, {
        body: {},
      }),
    staleTime: 50 * 60_000,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        {viewer.isError ? (
          <ErrorState
            message={
              viewer.error instanceof ApiRequestError ? viewer.error.message : 'Could not join the stream.'
            }
            onRetry={() => viewer.refetch()}
          />
        ) : !viewer.data ? (
          <Skeleton className="aspect-video" />
        ) : (
          <LiveKitRoom
            serverUrl={viewer.data.wsUrl}
            token={viewer.data.token}
            connect
            audio={false}
            video={false}
          >
            <div className="relative">
              <StreamVideo blurred={viewer.data.blurred} />
              <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
                <LiveBadge />
                <ViewerCount count={stream.viewers} />
                <span className="rounded-md bg-black/70 px-2 py-0.5 font-mono text-xs">
                  {formatDuration(elapsed)}
                </span>
              </div>
            </div>
            <LiveChatFeed onMessage={onMessage} />
          </LiveKitRoom>
        )}
        <div className="glass flex items-center gap-3 rounded-card p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/30 font-bold">
            {(stream.streamer.displayName ?? stream.streamer.address).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{stream.title}</p>
            <p className="text-xs text-muted">
              {stream.streamer.displayName ?? shortAddress(stream.streamer.address)} · 0 min streamed · 0
              $APECAM earned
            </p>
          </div>
          <Button size="sm" variant="ghost" disabled title="Reporting arrives in Sprint 2">
            Report
          </Button>
        </div>
      </div>
      <ChatPanel streamId={stream.id} live={live} className="lg:h-[calc(100vh-180px)]" />
    </div>
  );
}
