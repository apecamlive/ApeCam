import { Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { TokenRoom } from './token-room';

export default async function TokenRoomPage({
  params,
}: {
  params: Promise<{ chain: string; contract: string }>;
}) {
  const { chain, contract } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-[480px]" />}>
      <TokenRoom chain={chain} contract={contract} />
    </Suspense>
  );
}
