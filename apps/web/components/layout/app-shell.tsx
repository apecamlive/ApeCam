'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';
import { ConnectButton } from '@/components/wallet/connect';
import { usePublicConfig } from '@/lib/client/public-config';

const NAV = [
  { href: '/', label: 'Live', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { href: '/search', label: 'Search', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35' },
  { href: '/go-live', label: 'Go Live', icon: 'M23 7l-7 5 7 5V7zM1 5h15v14H1z' },
  {
    href: '/burn',
    label: 'Burn',
    icon: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 1-7 1-10z',
  },
  { href: '/about', label: 'About', icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01' },
];

const FOOTER = [
  ['/rules', 'Content rules'],
  ['/terms', 'Terms'],
  ['/privacy', 'Privacy'],
  ['/burn', 'Burn tracker'],
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search ticker or paste contract"
        aria-label="Search ticker or contract address"
        className="h-10 w-full rounded-full border border-line bg-input px-4 text-sm placeholder:text-subtle focus:border-primary focus:outline-none"
      />
    </form>
  );
}

/** Desktop: 64px icon sidebar + top bar (prototype layout). Mobile: top bar + bottom nav. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const config = usePublicConfig().data;
  return (
    <div className="min-h-screen md:pl-16">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-2 border-r border-line bg-[rgb(9_10_15/0.85)] py-4 backdrop-blur md:flex">
        <Link
          href="/"
          className="mb-4 font-display text-lg font-black text-primary-light"
          aria-label="APECAM home"
        >
          A
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            title={n.label}
            aria-label={n.label}
            className={cx(
              'flex h-10 w-10 items-center justify-center rounded-xl transition',
              active(n.href) ? 'bg-primary text-white' : 'text-muted hover:bg-white/5 hover:text-fg',
            )}
          >
            <Icon d={n.icon} />
          </Link>
        ))}
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-[rgb(5_5_8/0.8)] px-4 backdrop-blur">
        <Link href="/" className="font-display text-xl font-black tracking-tight">
          APE<span className="text-primary-light">CAM</span>
        </Link>
        <SearchBox className="mx-auto hidden w-full max-w-md sm:block" />
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <Link
            href="/go-live"
            className="hidden h-8 items-center rounded-full bg-live-strong px-3 text-xs font-bold text-white hover:bg-live-strong-hover sm:inline-flex"
          >
            ● Go Live
          </Link>
          <ConnectButton compact />
        </div>
      </header>

      {config && config.goLiveAccess !== 'open' && (
        <p role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs">
          {config.goLiveAccess === 'invite'
            ? 'Closed beta: Go Live is open to invited streamers. Everyone can watch and chat.'
            : 'Go Live is paused right now. Watching and chat still work.'}
        </p>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">{children}</main>

      <footer className="mx-auto flex w-full max-w-7xl flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 pb-24 pt-4 text-xs text-muted md:pb-6">
        <span>APECAM · Hold it. Stream it.</span>
        {FOOTER.map(([href, label]) => (
          <Link key={href} href={href} className="hover:text-fg">
            {label}
          </Link>
        ))}
        {config?.feedbackUrl && (
          <a href={config.feedbackUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
            Beta feedback
          </a>
        )}
        <span className="ml-auto">Not financial advice. 18+ to stream.</span>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-line bg-[rgb(9_10_15/0.95)] md:hidden">
        {NAV.slice(0, 4).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cx(
              'flex flex-col items-center gap-0.5 text-[11px]',
              active(n.href) ? 'text-primary-light' : 'text-muted',
            )}
          >
            <Icon d={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
