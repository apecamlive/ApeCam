import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Studio } from './studio';

export const metadata: Metadata = { title: 'Go Live' };

export default function GoLivePage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}
