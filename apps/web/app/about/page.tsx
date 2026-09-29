import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui';

export const metadata: Metadata = { title: 'About' };

/** Short version from the Dev Brief; lore and tokenomics copy arrive from the owner in Sprint 4. */
export default function AboutPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-display text-3xl font-black">
        Your bag is your mic. <span className="text-primary-light">Hold to stream.</span>
      </h1>
      <ol className="grid gap-3 sm:grid-cols-3">
        {['Connect your wallet', 'Hold $100 of a token', 'Go live for it'].map((s, i) => (
          <li key={s} className="glass rounded-card p-4">
            <p className="tag">{String(i + 1).padStart(2, '0')}</p>
            <p className="font-semibold">{s}</p>
          </li>
        ))}
      </ol>
      <Link href="/go-live">
        <Button variant="white">Go Live</Button>
      </Link>
    </article>
  );
}
