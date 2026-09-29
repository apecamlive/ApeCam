import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'Burn & Buyback Tracker' };

export default function BurnPage() {
  return (
    <EmptyState
      title="Burn & Buyback Tracker"
      body="On-chain buyback and burn tracking for $APECAM arrives in Sprint 3."
    />
  );
}
