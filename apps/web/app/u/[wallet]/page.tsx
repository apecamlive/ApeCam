import type { Metadata } from 'next';
import { profileLabel, safeProfileSeo } from '@/lib/server/seo';
import { Profile } from './profile';

type Params = { params: Promise<{ wallet: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { wallet } = await params;
  const seo = await safeProfileSeo(wallet);
  const label = profileLabel(seo, wallet);
  const description = seo?.liveTitle
    ? `${label} is live on APECAM: “${seo.liveTitle}”`
    : `Streams and Stream to Earn history of ${label} on APECAM.`;
  return {
    title: label,
    description,
    alternates: { canonical: `/u/${wallet}` },
    openGraph: { title: `${label} on APECAM`, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title: `${label} on APECAM`, description },
    // Wallets without an APECAM profile should not be indexed.
    robots: seo ? undefined : { index: false },
  };
}

export default async function ProfilePage({ params }: Params) {
  const { wallet } = await params;
  return <Profile wallet={wallet} />;
}
