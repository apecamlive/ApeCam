'use client';

import { formatUsd, shortAddress } from '@apecam/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { SearchBox } from '@/components/layout/app-shell';
import { EmptyState, ErrorState, LiveBadge, Skeleton, TokenAvatar } from '@/components/ui';
import { api, type SearchResult } from '@/lib/client/api';

function Results() {
  const q = useSearchParams().get('q') ?? '';
  const router = useRouter();
  const search = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<{ results: SearchResult[] }>(`/api/tokens/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  const results = search.data?.results ?? [];

  // A pasted contract that matches exactly one token goes straight to its room.
  useEffect(() => {
    if (results.length === 1 && results[0]!.contract.toLowerCase() === q.trim().toLowerCase()) {
      router.replace(`/t/${results[0]!.chain}/${results[0]!.contract}`);
    }
  }, [results, q, router]);

  if (q.trim().length < 2) return <p className="text-sm text-muted">Type at least 2 characters.</p>;
  if (search.isLoading) return <Skeleton className="h-40" />;
  if (search.isError) return <ErrorState message="Search failed." onRetry={() => search.refetch()} />;
  if (!results.length)
    return (
      <EmptyState title="No tokens found" body={`Nothing matches “${q}”. Try the full contract address.`} />
    );

  return (
    <ul className="flex flex-col gap-2">
      {results.map((r) => (
        <li key={`${r.chain}:${r.contract}`}>
          <Link
            href={`/t/${r.chain}/${r.contract}`}
            className="glass flex items-center gap-3 rounded-card p-3 hover:bg-card-hover"
          >
            <TokenAvatar logoUrl={r.logoUrl} ticker={r.ticker} contract={r.contract} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">${r.ticker ?? '???'}</p>
              <p className="truncate text-xs text-muted">
                {r.name} · <span className="font-mono">{shortAddress(r.contract)}</span>
              </p>
            </div>
            <span className="text-sm text-muted">MC {formatUsd(r.marketCapUsd)}</span>
            {r.live > 0 && <LiveBadge />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function SearchPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SearchBox className="sm:hidden" />
      <h1 className="font-display text-2xl font-bold">Search</h1>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Results />
      </Suspense>
    </div>
  );
}
