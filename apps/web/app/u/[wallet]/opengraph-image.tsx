import { OG_SIZE, ogCard } from '@/lib/og/card';
import { profileLabel, safeProfileSeo } from '@/lib/server/seo';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Streamer profile on APECAM';

export default async function Image({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const seo = await safeProfileSeo(wallet);
  return ogCard({
    kicker: 'streamer',
    title: profileLabel(seo, wallet),
    subtitle: seo?.liveTitle ?? 'Streams and Stream to Earn on APECAM',
    live: !!seo?.liveTitle,
  });
}
