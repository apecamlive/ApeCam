'use client';

import { formatCompact, placeholderLogo, shortAddress } from '@apecam/shared';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'white' | 'dark' | 'primary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  white: 'bg-white text-black hover:bg-fg-soft',
  dark: 'glass text-fg hover:bg-card-hover',
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-[0_0_30px_rgb(29_78_216/0.5)]',
  danger: 'bg-live-strong text-white hover:bg-live-strong-hover',
  ghost: 'text-muted hover:text-fg',
};

export function Button({
  variant = 'dark',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('glass inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs', className)}>
      {children}
    </span>
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md bg-live-strong px-2 py-0.5 text-[11px] font-bold tracking-wider text-white',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white [animation:live-pulse_1.4s_infinite]" />
      LIVE
    </span>
  );
}

export function ViewerCount({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-xs text-white',
        className,
      )}
      aria-label={`${count} viewers`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {formatCompact(count, 1)}
    </span>
  );
}

/** Token logo with the Dev Brief fallback: initials on a colour derived from the contract. */
export function TokenAvatar({
  logoUrl,
  ticker,
  contract,
  size = 32,
}: {
  logoUrl: string | null | undefined;
  ticker: string | null | undefined;
  contract: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const { initials, hue } = placeholderLogo(ticker, contract);
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={ticker ?? 'token'}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full bg-card-solid object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-label={ticker ?? 'token'}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 60% 35%)` }}
    >
      {initials}
    </span>
  );
}

/** Clipboard API first; the legacy execCommand path covers insecure contexts and blocked permissions. */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      onClick={async () => setState((await copyText(value)) ? 'copied' : 'failed')}
      className={cx(
        'rounded-md px-2 py-1 text-xs font-semibold transition',
        state === 'copied' && 'bg-emerald/20 text-emerald-light',
        state === 'failed' && 'bg-live/20 text-live',
        state === 'idle' && 'bg-white/10 text-fg hover:bg-white/20',
        className,
      )}
      aria-live="polite"
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Press Ctrl+C' : label}
    </button>
  );
}

export function AddressShort({ address, className }: { address: string; className?: string }) {
  return (
    <span className={cx('font-mono', className)} title={address}>
      {shortAddress(address)}
    </span>
  );
}

export function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: 'emerald' | 'live';
}) {
  return (
    <div className="flex flex-col">
      <span className="tag">{label}</span>
      <span
        className={cx(
          'font-display text-lg font-semibold',
          accent === 'emerald' && 'text-emerald-light',
          accent === 'live' && 'text-live',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="glass inline-flex rounded-full p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'rounded-full px-4 py-1.5 text-sm font-semibold transition',
            value === t.id ? 'bg-white text-black' : 'text-muted hover:text-fg',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass w-full max-w-md rounded-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-card bg-white/5', className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-panel px-6 py-12 text-center">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-panel border border-live/30 bg-live/10 px-6 py-8 text-center"
    >
      <p className="text-sm text-fg-soft">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
