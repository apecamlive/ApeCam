import { OG_SIZE, ogCard } from '@/lib/og/card';
import { safeTokenSeo, tokenLabel } from '@/lib/server/seo';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Token room on APECAM';

export default async function Image({ params }: { params: Promise<{ chain: string; contract: string }> }) {
  const { chain, contract } = await params;
  const seo = await safeTokenSeo(chain, contract);
  const live = seo?.live.streams ?? 0;
  return ogCard({
    kicker: `${chain} · token room`,
    title: tokenLabel(seo, contract),
    subtitle: live
      ? `${live} live now · ${seo?.live.viewers ?? 0} watching`
      : (seo?.name ?? 'Hold $100 to go live'),
    live: live > 0,
  });
}
