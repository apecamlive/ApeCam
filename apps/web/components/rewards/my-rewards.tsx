'use client';

import { formatCompact, shortAddress } from '@apecam/shared';
import { useQuery } from '@tanstack/react-query';
import { cx, Skeleton } from '@/components/ui';
import { api, tokens18 } from '@/lib/client/api';

interface MyRewards {
  totals: { pendingRaw: string; paidRaw: string; earnedRaw: string };
  rewards: {
    period: string;
    validMinutes: number;
    amountRaw: string;
    scaleFactor: number;
    status: 'pending' | 'batched' | 'paid' | 'void';
    payoutTxHash: string | null;
    paidAt: string | null;
    voidReason: string | null;
  }[];
}

const STATUS: Record<MyRewards['rewards'][number]['status'], { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-white/10' },
  batched: { label: 'In this week’s payout', cls: 'bg-primary/20 text-primary-light' },
  paid: { label: 'Paid', cls: 'bg-emerald/20 text-emerald-light' },
  void: { label: 'Voided', cls: 'bg-live/20 text-live' },
};

/** Owner-only reward history (S3-9): per UTC day, with the pro-rata note when the treasury ran short (D6). */
export function MyRewardsSection() {
  const q = useQuery({ queryKey: ['my-rewards'], queryFn: () => api<MyRewards>('/api/me/rewards') });
  if (q.isPending) return <Skeleton className="h-32" />;
  if (!q.data) return null;
  const { totals, rewards } = q.data;
  return (
    <section className="glass rounded-card">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line px-4 py-3">
        <h2 className="font-semibold">My Stream to Earn rewards</h2>
        <span className="text-sm">
          pending <b>{formatCompact(tokens18(totals.pendingRaw), 1)}</b> · paid{' '}
          <b className="text-emerald-light">{formatCompact(tokens18(totals.paidRaw), 1)}</b> $APECAM
        </span>
      </div>
      {rewards.length === 0 ? (
        <p className="p-4 text-sm text-muted">
          No rewards yet. Stream at least 10 valid minutes in a UTC day with 3+ signed-in viewers to earn
          1,000 $APECAM.
        </p>
      ) : (
        <ul>
          {rewards.map((r) => (
            <li
              key={r.period}
              className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-sm"
            >
              <span className="w-24 font-mono text-xs">{r.period}</span>
              <span className="w-20 text-xs text-muted">{r.validMinutes} min</span>
              <span className="font-semibold">{formatCompact(tokens18(r.amountRaw), 2)} $APECAM</span>
              {r.scaleFactor < 1 && (
                <span
                  className="text-xs text-warning"
                  title="Treasury was short this week, so every reward was scaled by the same factor (D6)."
                >
                  scaled {Math.round(r.scaleFactor * 1000) / 10}% (treasury)
                </span>
              )}
              <span className={cx('ml-auto rounded-full px-2 py-0.5 text-xs', STATUS[r.status].cls)}>
                {STATUS[r.status].label}
              </span>
              {r.payoutTxHash && (
                <a
                  className="font-mono text-xs text-primary-light"
                  href={`https://robinhoodchain.blockscout.com/tx/${r.payoutTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortAddress(r.payoutTxHash)}
                </a>
              )}
              {r.voidReason && <span className="w-full text-xs text-live">Voided: {r.voidReason}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
