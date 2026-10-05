import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import { siteOrigin } from '@/lib/site';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: 'APECAM — Hold it. Stream it.', template: '%s · APECAM' },
  description: 'Decentralized tokenized livestream protocol. Hold a token, go live for it.',
  openGraph: { siteName: 'APECAM', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#050505' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
