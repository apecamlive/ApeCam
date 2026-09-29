import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Content rules' };

/** Draft from the Dev Brief. Final wording comes from the owner and legal review (Sprint 4, S4-1 / S4-11). */
export default function RulesPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="tag">// draft — final text pending owner and legal review</p>
      <h1 className="font-display text-3xl font-black">Content rules</h1>
      <section className="glass rounded-card p-5">
        <h2 className="mb-2 font-display text-lg font-semibold">Not allowed on APECAM</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-soft">
          <li>Violence, threats, self-harm, or harm to animals.</li>
          <li>Sexual content or nudity; anything involving minors.</li>
          <li>Hate speech or harassment.</li>
          <li>Scams, impersonation, fake giveaways, or instructions to send funds.</li>
          <li>Illegal activity of any kind.</li>
        </ul>
      </section>
      <section className="glass rounded-card p-5 text-sm text-fg-soft">
        <h2 className="mb-2 font-display text-lg font-semibold text-fg">Penalties</h2>
        Streams that break these rules are stopped, and the wallet can be banned temporarily or permanently.
      </section>
      <section className="glass rounded-card p-5 text-sm text-fg-soft">
        <h2 className="mb-2 font-display text-lg font-semibold text-fg">Not financial advice</h2>
        Streams are opinions of the streamer. Nothing on APECAM is financial advice. APECAM will never ask for
        your seed phrase or private key.
      </section>
    </article>
  );
}
