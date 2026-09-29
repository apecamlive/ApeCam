'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';
import {
  AddressShort,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  LiveBadge,
  Pill,
  Skeleton,
  Stat,
  Tabs,
  TokenAvatar,
  ViewerCount,
} from '@/components/ui';

/** Component gallery for design review (S1-1). Not available in production builds. */
export default function UiGallery() {
  const [tab, setTab] = useState<'a' | 'b'>('a');
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SHOW_DEV_UI !== '1') notFound();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-3xl font-black">UI gallery</h1>
      <section className="flex flex-wrap items-center gap-3">
        <Button variant="white">White</Button>
        <Button>Dark</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Disabled</Button>
      </section>
      <section className="flex flex-wrap items-center gap-3">
        <LiveBadge />
        <ViewerCount count={12_400} />
        <Pill>Pill</Pill>
        <TokenAvatar logoUrl={null} ticker="PEPE" contract="0xabc" />
        <TokenAvatar logoUrl={null} ticker="WIF" contract="EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" />
        <AddressShort address="0x1234567890abcdef1234567890abcdef12345678" />
        <CopyButton value="0x1234567890abcdef1234567890abcdef12345678" />
      </section>
      <section className="flex gap-8">
        <Stat label="Market cap" value="$1.2M" />
        <Stat label="Earned" value="5,000" accent="emerald" />
        <Stat label="Status" value="LIVE" accent="live" />
      </section>
      <Tabs
        tabs={[
          { id: 'a', label: 'Live Now' },
          { id: 'b', label: 'Trending' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Skeleton className="h-24" />
      <EmptyState title="Empty state" body="Body text" action={<Button variant="primary">Action</Button>} />
      <ErrorState message="Error state" onRetry={() => undefined} />
    </div>
  );
}
