import type { Metadata } from 'next';
import { BurnTracker } from './tracker';

export const metadata: Metadata = {
  title: 'Burn & Buyback Tracker',
  description: 'Every $APECAM buyback and burn, read straight from Robinhood Chain.',
};

export default function BurnPage() {
  return <BurnTracker />;
}
