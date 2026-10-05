import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { safeTokenSeo, tokenLabel } from '@/lib/server/seo';
import { TokenRoom } from './token-room';

type Params = { params: Promise<{ chain: string; contract: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { chain, contract } = await params;
  const seo = await safeTokenSeo(chain, contract);
  const label = tokenLabel(seo, contract);
  const live = seo?.live.streams ?? 0;
  const description = live
    ? `${live} live ${live === 1 ? 'stream' : 'streams'} for ${label} on APECAM. Hold it. Stream it.`
    : `The ${label} room on APECAM. Hold $100 of ${label} to go live for it.`;
  return {
    title: seo?.name ? `${label} · ${seo.name}` : label,
    description,
    alternates: { canonical: `/t/${chain}/${contract}` },
    openGraph: { title: `${label} live on APECAM`, description, type: 'website' },
    twitter: { card: 'summary_large_image', title: `${label} live on APECAM`, description },
  };
}

export default async function TokenRoomPage({ params }: Params) {
  const { chain, contract } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-[480px]" />}>
      <TokenRoom chain={chain} contract={contract} />
    </Suspense>
  );
}
