'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';
import { ConnectButton } from '@/components/wallet/connect';
import { usePublicConfig } from '@/lib/client/public-config';

const NAV = [
  { href: '/', label: 'Live', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { href: '/search', label: 'Search', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35' },
  { href: '/go-live', label: 'Go Live', icon: 'M15 10l5-3v10l-5-3M3 6h12v12H3z' },
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

function Icon({ d, className = 'h-[18px] w-[18px]' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** Brand mark: a lens with a recording dot. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#fafafa" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="#050505" strokeWidth="3" />
      <circle cx="16" cy="16" r="2.6" fill="#050505" />
      <circle cx="25" cy="7" r="2.6" fill="#dc2626" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={26} />
      <span className="font-mono text-[13px] font-medium tracking-[0.28em] text-fg">APECAM</span>
    </span>
  );
}

export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label className="flex h-10 items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3.5 text-sm text-muted transition focus-within:border-line-strong">
        <Icon d={NAV[1]!.icon} className="h-4 w-4 shrink-0" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ticker or paste contract"
          aria-label="Search ticker or contract address"
          className="min-w-0 flex-1 bg-transparent text-fg placeholder:text-subtle focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-subtle md:inline">
          ⌘K
        </kbd>
      </label>
    </form>
  );
}

/** Desktop: slim icon rail + top bar. Mobile: top bar + bottom tab bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const config = usePublicConfig().data;
  return (
    <div className="min-h-screen md:pl-16">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-1.5 border-r border-line bg-bg/80 py-4 backdrop-blur md:flex">
        <Link href="/" aria-label="APECAM home" className="mb-5">
          <LogoMark size={30} />
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            title={n.label}
            aria-label={n.label}
            className={cx(
              'flex h-10 w-10 items-center justify-center rounded-xl transition',
              active(n.href) ? 'bg-white/10 text-fg' : 'text-subtle hover:bg-white/5 hover:text-fg',
            )}
          >
            <Icon d={n.icon} />
          </Link>
        ))}
      </aside>

      <header className="sticky top-0 z-20 grid h-16 grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[1fr_minmax(0,28rem)_1fr] border-b border-line bg-bg/80 px-4 backdrop-blur-md">
        <div>
          <Link href="/" className="inline-block md:hidden" aria-label="APECAM home">
            <Wordmark />
          </Link>
        </div>
        <SearchBox className="hidden w-full sm:block" />
        <div className="flex items-center justify-end gap-2">
          <Link
            href="/go-live"
            className="hidden h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black transition hover:bg-white/85 sm:inline-flex"
          >
            <span className="h-2 w-2 rounded-full bg-live-strong" aria-hidden="true" />
            Go Live
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

      <main className="mx-auto w-full max-w-[1320px] px-4 pb-10 pt-5 md:px-6">{children}</main>

      <footer className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 pb-24 pt-5 text-xs text-subtle md:px-6 md:pb-6">
        <Wordmark />
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

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-line bg-bg/95 backdrop-blur md:hidden">
        {NAV.slice(0, 4).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cx(
              'flex flex-col items-center gap-1 text-[11px]',
              active(n.href) ? 'text-fg' : 'text-subtle',
            )}
          >
            <Icon d={n.icon} className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
