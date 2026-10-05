import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Terms of Use' };

/** Engineering draft (S4-11). Must be replaced or approved by the owner's legal review before launch. */
export default function TermsPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 text-sm text-fg-soft">
      <p className="w-fit rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs text-fg-soft">
        Draft, pending legal review
      </p>
      <h1 className="font-display text-3xl font-black text-fg">Terms of Use</h1>
      <Section title="1. Who can use APECAM">
        You must be at least 18 years old to stream. By going live you confirm you are 18 or older and allowed
        to use APECAM where you live.
      </Section>
      <Section title="2. Wallets">
        You sign in by signing a plain-text message with your wallet. APECAM never asks you to sign a
        transaction, never holds your funds, and never asks for your seed phrase or private key. You are
        responsible for your wallet and its security.
      </Section>
      <Section title="3. Streaming">
        You may go live for a token only while your wallet holds the required minimum value of it. You are
        responsible for everything you broadcast. Streams must follow the{' '}
        <Link href="/rules" className="text-primary-light underline">
          content rules
        </Link>
        . APECAM may stop streams, hide tokens and ban wallets that break them, without notice.
      </Section>
      <Section title="4. Not financial advice">
        Streams and chat are the opinions of their authors. Nothing on APECAM is investment advice or an offer
        to buy or sell any token. Tokens are highly risky; you can lose everything you put in.
      </Section>
      <Section title="5. Stream to Earn">
        Rewards are discretionary, paid from a public treasury wallet, and may be scaled down, changed or
        stopped. Minutes that break the rules, or that APECAM believes were farmed, may be voided. Rewards
        have no guaranteed value.
      </Section>
      <Section title="6. Third parties">
        Token data, prices and charts come from third parties (such as DexScreener and blockchain RPC
        providers) and may be wrong or delayed. Launchpad names are used descriptively; APECAM is not
        affiliated with them.
      </Section>
      <Section title="7. No warranty">
        APECAM is provided as is, without warranties. To the extent the law allows, APECAM is not liable for
        losses arising from your use of the service or of any token.
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
