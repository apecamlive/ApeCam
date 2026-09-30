import { APP_CONFIG_DEFAULTS, type AppConfig } from '@apecam/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { getDeps } from '@/lib/server/deps';

// Reward numbers come from app_config (admin-editable), so render per request (config is cached 60 s).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About',
  description: 'APECAM is a decentralized tokenized livestream: hold a token, go live for it, earn $APECAM.',
};

const VALUES = [
  {
    title: 'Decentralized Tokenized Livestream',
    body: 'Broadcast rights come from token ownership, not from a gatekeeper. No application, no approval: if you hold it, you can stream it.',
  },
  {
    title: 'Every launchpad, one stage',
    body: 'Tokens from Pons, Pump.fun, Flap and every other launchpad, on any supported chain, get the same stage. One room per token contract.',
  },
  {
    title: 'Your bag is your mic',
    body: 'Hold a token to go live. Go live to earn $APECAM. Streamers who show up are paid from a public treasury.',
  },
];

const STEPS = [
  {
    title: 'Connect',
    body: 'Sign in with a Solana or EVM wallet. Signing in is a message, never a transaction.',
  },
  {
    title: 'Hold',
    body: 'Hold at least $100 of a token. The value is checked live and re-checked during the stream.',
  },
  {
    title: 'Go Live',
    body: 'Camera or screen, straight from the browser. Your stream appears in that token’s room.',
  },
];

const TOKENOMICS = [
  { pct: 50, label: 'Operations', body: 'Servers, RPC, moderation, development.' },
  { pct: 30, label: 'Buyback & burn', body: 'Daily buyback of $APECAM, sent to the burn address.' },
  { pct: 20, label: 'Stream to Earn treasury', body: 'Rewards for streamers, paid weekly.' },
];

async function loadConfig(): Promise<AppConfig> {
  try {
    return await (await getDeps()).config();
  } catch {
    return APP_CONFIG_DEFAULTS; // DB unreachable: the published defaults are still correct
  }
}

export default async function AboutPage() {
  const config = await loadConfig();
  const tiers = config['s2e.tiers'];
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-10 py-4">
      <header className="flex flex-col gap-3">
        <p className="tag">// about</p>
        <h1 className="font-display text-4xl font-black leading-tight">
          Your bag is your mic. <span className="text-primary-light">Hold it. Stream it.</span>
        </h1>
        <p className="text-fg-soft">
          Livestreaming on memecoin launchpads is scattered: some have it, most don’t. APECAM is one stage for
          every token, where the people holding a coin can go live and talk about it.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        {VALUES.map((v) => (
          <div key={v.title} className="glass rounded-card p-5">
            <h2 className="mb-1 font-display font-semibold">{v.title}</h2>
            <p className="text-sm text-fg-soft">{v.body}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass rounded-card p-5">
              <p className="tag">{String(i + 1).padStart(2, '0')}</p>
              <p className="font-display text-lg font-semibold">{s.title}</p>
              <p className="text-sm text-fg-soft">{s.body}</p>
            </li>
          ))}
        </ol>
        <div>
          <Link href="/go-live">
            <Button variant="white">Go Live</Button>
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Stream to Earn</h2>
        <p className="text-sm text-fg-soft">
          Valid live minutes earn $APECAM, counted per UTC day across all your streams. A minute counts only
          when you still hold $100 of the token, at least {config['s2e.min_viewers']} signed-in viewers (not
          your own wallets) are watching, real video is live, and the stream has no open report.
        </p>
        <table className="glass w-full overflow-hidden rounded-card text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="p-3 font-medium">Valid minutes today</th>
              <th className="p-3 font-medium">Total earned that day</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map(([min, amount]) => (
              <tr key={min} className="border-t border-line">
                <td className="p-3 font-mono">{min} min</td>
                <td className="p-3 font-mono">{amount.toLocaleString('en-US')} $APECAM</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          Daily cap {config['s2e.daily_cap'].toLocaleString('en-US')} $APECAM. Paid every Monday for the
          previous week from the public treasury wallet. If the treasury cannot cover a week, everyone in that
          batch is scaled down by the same percentage.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold">Tokenomics</h2>
        <p className="text-sm text-fg-soft">
          The $APECAM creator fee is split three ways, all on public wallets:
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {TOKENOMICS.map((t) => (
            <div key={t.label} className="glass rounded-card p-5">
              <p className="font-display text-3xl font-black text-primary-light">{t.pct}%</p>
              <p className="font-semibold">{t.label}</p>
              <p className="text-sm text-fg-soft">{t.body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm">
          Every buyback, burn and payout is on the{' '}
          <Link href="/burn" className="text-primary-light underline">
            Burn tracker
          </Link>
          .
        </p>
      </section>

      <section className="glass rounded-card p-5 text-sm text-fg-soft">
        <h2 className="mb-1 font-display text-lg font-semibold text-fg">Safety</h2>
        APECAM never asks you to sign a transaction and never asks for your seed phrase. Streams are opinions,
        not financial advice. Streaming is for adults (18+).{' '}
        <Link href="/rules" className="text-primary-light underline">
          Content rules
        </Link>{' '}
        ·{' '}
        <Link href="/terms" className="text-primary-light underline">
          Terms
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className="text-primary-light underline">
          Privacy
        </Link>
      </section>
    </article>
  );
}
