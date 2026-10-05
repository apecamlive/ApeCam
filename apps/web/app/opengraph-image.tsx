import { OG_SIZE, ogCard } from '@/lib/og/card';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'APECAM — Hold it. Stream it.';

export default function Image() {
  return ogCard({
    kicker: 'decentralized tokenized livestream',
    title: 'Hold it.',
    subtitle: 'Stream it. Every launchpad, one stage.',
  });
}
