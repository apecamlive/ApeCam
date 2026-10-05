import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Privacy' };

/** Engineering draft (S4-11) describing what the code actually stores. Pending legal review. */
export default function PrivacyPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 text-sm text-fg-soft">
      <p className="w-fit rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-fg-soft">
        Draft, pending legal review
      </p>
      <h1 className="font-display text-3xl font-black text-fg">Privacy</h1>
      <Section title="What we store">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your public wallet addresses and the time you first signed in.</li>
          <li>Your display name and avatar, if you set them.</li>
          <li>Streams you start: token, title, start/end time, viewer counts and periodic snapshots.</li>
          <li>Chat messages you send, reports you file, and moderation actions on your account.</li>
          <li>Stream to Earn minutes and payouts linked to your wallet.</li>
        </ul>
      </Section>
      <Section title="What we do not store">
        No email, no phone number, no private keys, no seed phrases. Video is relayed live and not recorded;
        only still snapshots are kept for moderation and thumbnails.
      </Section>
      <Section title="Cookies">
        One essential session cookie keeps you signed in. No advertising or tracking cookies.
      </Section>
      <Section title="Public by design">
        Wallet addresses, streams, chat and payouts are public, and blockchain transactions are public
        forever. Do not share personal information on stream or in chat.
      </Section>
      <Section title="Service providers">
        Hosting (Railway), video (LiveKit), file storage (Cloudflare R2), CDN (Cloudflare), blockchain RPC and
        price data providers, and Privy for embedded wallets. They process data only to run APECAM.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass rounded-card p-5">
      <h2 className="mb-2 font-display text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}
