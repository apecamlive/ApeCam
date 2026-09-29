import type { Metadata, Viewport } from 'next';
import { Inter, Outfit, Space_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['400', '600', '700', '900'],
});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceMono = Space_Mono({ subsets: ['latin'], variable: '--font-space-mono', weight: ['400', '700'] });

export const metadata: Metadata = {
  title: { default: 'APECAM — Hold it. Stream it.', template: '%s · APECAM' },
  description: 'Decentralized tokenized livestream protocol. Hold a token, go live for it.',
};

export const viewport: Viewport = { themeColor: '#050508' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable} ${spaceMono.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
