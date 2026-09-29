'use client';

import { formatDuration, shortAddress } from '@apecam/shared';
import {
  LiveKitRoom,
  useDataChannel,
  useLocalParticipant,
  useRemoteParticipants,
  VideoTrack,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { ConnectButton } from '@/components/wallet/connect';
import { Button, cx, EmptyState, LiveBadge, TokenAvatar } from '@/components/ui';
import { api, ApiRequestError, ELIGIBILITY_MESSAGES, type Eligibility } from '@/lib/client/api';

const EVM_CHAINS = [
  { id: 'robinhood', label: 'Robinhood Chain' },
  { id: 'base', label: 'Base' },
  { id: 'bsc', label: 'BNB Chain' },
];

type Session = { streamId: string; token: string; wsUrl: string; title: string };

export function Studio() {
  const { me, signedIn, loading } = useAuth();
  const params = useSearchParams();
  const [walletId, setWalletId] = useState<string>('');
  const [chain, setChain] = useState(params.get('chain') ?? 'solana');
  const [contract, setContract] = useState(params.get('contract') ?? '');
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [rules, setRules] = useState(false);
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [ended, setEnded] = useState<string | null>(null);

  const wallets = me?.wallets ?? [];
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0];
  useEffect(() => {
    if (!wallet) return;
    setWalletId(wallet.id);
    if (wallet.family === 'solana') setChain('solana');
    else if (chain === 'solana') setChain('robinhood');
  }, [wallet?.id]);

  if (loading) return null;
  if (!signedIn) {
    return (
      <EmptyState
        title="Connect to go live"
        body="Hold at least $100 of a token, sign in with that wallet, and go live."
        action={<ConnectButton />}
      />
    );
  }
  if (session)
    return (
      <LiveStudio
        session={session}
        onEnded={(why) => {
          setSession(null);
          setEnded(why);
        }}
      />
    );

  async function check() {
    setChecking(true);
    setError(null);
    setElig(null);
    try {
      setElig(
        await api<Eligibility>('/api/streams/eligibility', {
          body: { chain, contract: contract.trim(), walletId: wallet!.id },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }

  async function goLive() {
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ streamId: string; token: string; wsUrl: string }>('/api/streams/start', {
        body: {
          chain,
          contract: contract.trim(),
          walletId: wallet!.id,
          title,
          source: 'camera',
          rulesAccepted: rules,
        },
      });
      setSession({ ...res, title });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not go live');
    } finally {
      setStarting(false);
    }
  }

  const canGoLive = elig?.passed && title.trim().length >= 3 && rules && !starting;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_380px]">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-black">Go Live</h1>
        {ended && <p className="rounded-card border border-warning/40 bg-warning/10 p-3 text-sm">{ended}</p>}

        <Step n={1} title="Wallet">
          <select
            value={wallet?.id}
            onChange={(e) => setWalletId(e.target.value)}
            className="h-10 w-full rounded-card border border-line bg-input px-3 text-sm"
            aria-label="Wallet"
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.family === 'solana' ? 'Solana' : 'EVM'} · {shortAddress(w.address)}
              </option>
            ))}
          </select>
        </Step>

        <Step n={2} title="Token">
          <div className="flex flex-col gap-2 sm:flex-row">
            {wallet?.family === 'evm' && (
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                className="h-10 rounded-card border border-line bg-input px-3 text-sm"
                aria-label="Chain"
              >
                {EVM_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <input
              value={contract}
              onChange={(e) => {
                setContract(e.target.value);
                setElig(null);
              }}
              placeholder="Paste token contract address"
              aria-label="Token contract address"
              className="h-10 min-w-0 flex-1 rounded-card border border-line bg-input px-3 font-mono text-sm focus:border-primary focus:outline-none"
            />
            <Button onClick={check} disabled={checking || contract.trim().length < 20}>
              {checking ? 'Checking…' : 'Check'}
            </Button>
          </div>
          {elig && <EligibilityCard e={elig} />}
        </Step>

        <Step n={3} title="Broadcast">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Stream title"
            aria-label="Stream title"
            className="h-10 w-full rounded-card border border-line bg-input px-3 text-sm focus:border-primary focus:outline-none"
          />
          <p className="text-xs text-muted">
            Source: camera + mic. Screen share arrives with the full Studio in Sprint 2.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={rules}
              onChange={(e) => setRules(e.target.checked)}
              className="mt-1"
            />
            <span>
              I agree to the{' '}
              <Link href="/rules" className="text-primary-light underline" target="_blank">
                content rules
              </Link>
              .
            </span>
          </label>
          <Button variant="danger" size="lg" disabled={!canGoLive} onClick={goLive}>
            {starting ? 'Starting…' : '● Go Live'}
          </Button>
          {error && <p className="text-sm text-live">{error}</p>}
        </Step>
      </section>
      <CameraPreview />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="glass flex flex-col gap-3 rounded-card p-4">
      <p className="tag">
        {String(n).padStart(2, '0')} // {title}
      </p>
      {children}
    </div>
  );
}

function EligibilityCard({ e }: { e: Eligibility }) {
  return (
    <div
      className={cx(
        'flex flex-col gap-2 rounded-card border p-3 text-sm',
        e.passed ? 'border-emerald/40 bg-emerald/10' : 'border-live/40 bg-live/10',
      )}
    >
      <div className="flex items-center gap-2">
        <TokenAvatar
          logoUrl={e.token.logoUrl}
          ticker={e.token.ticker}
          contract={e.token.contract}
          size={28}
        />
        <span className="font-display font-bold">${e.token.ticker ?? '???'}</span>
        <span className="ml-auto font-semibold">{e.passed ? '✅ Eligible' : '❌ Not eligible'}</span>
      </div>
      <p>
        Holding value: <b>${e.usdValue ?? '—'}</b> (minimum ${e.minUsd})
        {e.shortfallUsd && <span className="text-live"> · ${e.shortfallUsd} more needed</span>}
      </p>
      {e.reasons.map((r) => (
        <p key={r} className="text-fg-soft">
          • {ELIGIBILITY_MESSAGES[r] ?? r}
        </p>
      ))}
    </div>
  );
}

function CameraPreview() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'on' | 'denied'>('idle');
  useEffect(() => {
    let stream: MediaStream | undefined;
    if (state !== 'on') return;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setState('denied'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [state]);
  return (
    <aside className="glass flex flex-col gap-3 rounded-card p-4">
      <p className="tag">Preview</p>
      <div className="aspect-video overflow-hidden rounded-card bg-black">
        {state === 'on' && (
          <video ref={video} autoPlay muted playsInline className="h-full w-full object-cover" />
        )}
      </div>
      {state === 'denied' ? (
        <p className="text-sm text-live">
          Camera blocked. Allow camera access in your browser’s address bar, then try again.
        </p>
      ) : (
        <Button size="sm" onClick={() => setState(state === 'on' ? 'idle' : 'on')}>
          {state === 'on' ? 'Stop preview' : 'Test camera'}
        </Button>
      )}
    </aside>
  );
}

function LiveStudio({ session, onEnded }: { session: Session; onEnded: (why: string) => void }) {
  const [connected, setConnected] = useState(true);
  async function end() {
    await api(`/api/streams/${session.streamId}/end`, { body: {} }).catch(() => undefined);
    setConnected(false);
    onEnded('Stream ended.');
  }
  return (
    <LiveKitRoom
      serverUrl={session.wsUrl}
      token={session.token}
      connect={connected}
      video
      audio
      onDisconnected={() => connected && onEnded('Disconnected from the stream.')}
      className="mx-auto flex max-w-5xl flex-col gap-4"
    >
      <LivePanel
        title={session.title}
        onEnd={end}
        onCut={() => onEnded('Your stream was cut: the wallet no longer holds the minimum.')}
      />
    </LiveKitRoom>
  );
}

function LivePanel({ title, onEnd, onCut }: { title: string; onEnd: () => void; onCut: () => void }) {
  const { cameraTrack, localParticipant } = useLocalParticipant();
  const viewers = useRemoteParticipants().length;
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [cutAt, setCutAt] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useDataChannel('system', (msg) => {
    const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { type: string; cutAt?: string };
    if (data.type === 'holding_warning' && data.cutAt) setCutAt(new Date(data.cutAt).getTime());
    if (data.type === 'holding_ok') setCutAt(null);
    if (data.type === 'holding_cut') onCut();
  });

  return (
    <>
      <div className="flex items-center gap-3">
        <LiveBadge />
        <h1 className="truncate font-display text-2xl font-bold">{title}</h1>
        <span className="ml-auto font-mono text-sm">{formatDuration((now - started) / 1000)}</span>
      </div>
      {cutAt && (
        <div
          role="alert"
          className="rounded-card border border-warning/60 bg-warning/15 p-3 text-sm font-semibold"
        >
          ⚠ Your wallet dropped below the $100 minimum. The stream stops in{' '}
          {Math.max(0, Math.ceil((cutAt - now) / 1000))}s unless the holding is restored.
        </div>
      )}
      <div className="aspect-video overflow-hidden rounded-card bg-black">
        {cameraTrack ? (
          <VideoTrack
            trackRef={{
              participant: localParticipant,
              publication: cameraTrack,
              source: Track.Source.Camera,
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">Starting camera…</div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="glass rounded-full px-3 py-1 text-sm">{viewers} watching</span>
        <Button variant="danger" className="ml-auto" onClick={onEnd}>
          End Stream
        </Button>
      </div>
    </>
  );
}
