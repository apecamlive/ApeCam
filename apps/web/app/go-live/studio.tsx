'use client';

import { formatDuration, shortAddress } from '@apecam/shared';
import {
  LiveKitRoom,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { useQuery } from '@tanstack/react-query';
import { RoomEvent, Track } from 'livekit-client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/auth-context';
import { EarnPanel } from '@/components/stream/earn-panel';
import { Button, cx, EmptyState, LiveBadge, Skeleton, TokenAvatar } from '@/components/ui';
import { ConnectButton } from '@/components/wallet/connect';
import { usePublicConfig } from '@/lib/client/public-config';
import {
  api,
  ApiRequestError,
  ELIGIBILITY_MESSAGES,
  type Eligibility,
  type MeWallet,
  type StreamStatus,
  type WalletTokensResponse,
} from '@/lib/client/api';
import {
  browserBroadcastSupport,
  SOURCE_LABELS,
  type BroadcastSource,
  type BroadcastSupport,
} from '@/lib/client/broadcast';

const EVM_CHAINS = [
  { id: 'robinhood', label: 'Robinhood Chain' },
  { id: 'base', label: 'Base' },
  { id: 'bsc', label: 'BNB Chain' },
];

type LiveSession = {
  streamId: string;
  token: string;
  wsUrl: string;
  title: string;
  source: BroadcastSource;
  systemAudio: boolean;
};

export function Studio() {
  const { me, signedIn, loading } = useAuth();
  const params = useSearchParams();
  const [walletId, setWalletId] = useState('');
  const [chain, setChain] = useState(params.get('chain') ?? '');
  const [contract, setContract] = useState(params.get('contract') ?? '');
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState<BroadcastSource>('camera');
  const [systemAudio, setSystemAudio] = useState(false);
  const [rules, setRules] = useState(false);
  const [adult, setAdult] = useState(false);
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [support, setSupport] = useState<BroadcastSupport | null>(null);
  useEffect(() => setSupport(browserBroadcastSupport()), []);

  const wallets = me?.wallets ?? [];
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets.find((w) => !w.liveStreamId);
  useEffect(() => {
    if (!wallet) return;
    setWalletId(wallet.id);
    setChain((c) => (wallet.family === 'solana' ? 'solana' : c && c !== 'solana' ? c : 'robinhood'));
  }, [wallet?.id, wallet?.family]);

  if (loading) return <Skeleton className="mx-auto h-96 max-w-5xl" />;
  if (!signedIn) {
    return (
      <EmptyState
        title="Connect to go live"
        body="Hold at least $100 of a token, sign in with that wallet, and go live."
        action={<ConnectButton />}
      />
    );
  }
  if (session) {
    return (
      <LiveStudio
        session={session}
        onEnded={(why) => {
          setSession(null);
          setEnded(why);
          setElig(null);
        }}
      />
    );
  }

  if (me?.goLive && !me.goLive.allowed) {
    return (
      <GoLiveBlocked message={me.goLive.message} inviteOnly={me.goLive.code === 'GO_LIVE_INVITE_ONLY'} />
    );
  }

  async function check(nextChain = chain, nextContract = contract) {
    if (!wallet || nextContract.trim().length < 20) return;
    setChecking(true);
    setError(null);
    setElig(null);
    try {
      setElig(
        await api<Eligibility>('/api/streams/eligibility', {
          body: { chain: nextChain, contract: nextContract.trim(), walletId: wallet.id },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }

  async function goLive() {
    if (!wallet) return;
    setStarting(true);
    setError(null);
    try {
      const res = await api<{ streamId: string; token: string; wsUrl: string }>('/api/streams/start', {
        body: {
          chain,
          contract: contract.trim(),
          walletId: wallet.id,
          title,
          source,
          rulesAccepted: rules,
          ageConfirmed: adult,
        },
      });
      setSession({ ...res, title, source, systemAudio: systemAudio && source !== 'camera' });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not go live');
    } finally {
      setStarting(false);
    }
  }

  const sources = support?.sources ?? ['camera'];
  const canGoLive =
    !!elig?.passed && title.trim().length >= 3 && rules && adult && !starting && sources.includes(source);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-black">Go Live</h1>
        {ended && (
          <p role="status" className="rounded-card border border-warning/40 bg-warning/10 p-3 text-sm">
            {ended}
          </p>
        )}

        <Step n={1} title="Wallet">
          <WalletPicker
            wallets={wallets}
            selected={wallet?.id}
            onSelect={(id) => (setWalletId(id), setElig(null))}
          />
        </Step>

        <Step n={2} title="Token">
          {wallet && (
            <TokenPicker
              wallet={wallet}
              chain={chain}
              contract={contract}
              onPick={(c, addr) => {
                setChain(c);
                setContract(addr);
                void check(c, addr);
              }}
              onChain={(c) => (setChain(c), setElig(null))}
              onContract={(v) => (setContract(v), setElig(null))}
              onCheck={() => check()}
              checking={checking}
            />
          )}
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
          <div role="radiogroup" aria-label="Broadcast source" className="grid gap-2 sm:grid-cols-3">
            {(['camera', 'screen', 'screen_camera'] as BroadcastSource[]).map((s) => {
              const available = sources.includes(s);
              return (
                <button
                  key={s}
                  role="radio"
                  aria-checked={source === s}
                  disabled={!available}
                  onClick={() => setSource(s)}
                  className={cx(
                    'rounded-card border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40',
                    source === s ? 'border-primary bg-primary/15' : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className="block font-semibold">{SOURCE_LABELS[s].title}</span>
                  <span className="text-xs text-muted">
                    {available
                      ? SOURCE_LABELS[s].hint
                      : support?.mobile
                        ? 'Not available on phones'
                        : 'Not supported by this browser'}
                  </span>
                </button>
              );
            })}
          </div>
          {source !== 'camera' && (
            <label className={cx('flex items-center gap-2 text-sm', !support?.systemAudio && 'opacity-50')}>
              <input
                type="checkbox"
                checked={systemAudio}
                disabled={!support?.systemAudio}
                onChange={(e) => setSystemAudio(e.target.checked)}
              />
              Share tab/system audio{!support?.systemAudio && ' (Chrome or Edge on desktop only)'}
            </label>
          )}
        </Step>

        <Step n={4} title="Go live">
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
              . Breaking them ends the stream and can get this wallet banned.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
              className="mt-1"
            />
            <span>I am 18 or older.</span>
          </label>
          <Button variant="danger" size="lg" disabled={!canGoLive} onClick={goLive}>
            {starting ? 'Starting…' : '● Go Live'}
          </Button>
          {!elig?.passed && (
            <p className="text-xs text-muted">Pick a token you hold at least $100 of to continue.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-live">
              {error}
            </p>
          )}
        </Step>
      </section>
      <CameraPreview enabled={source !== 'screen'} />
    </div>
  );
}

/** Closed beta or emergency close (Sprint 5): explain instead of walking the user through a flow that fails. */
function GoLiveBlocked({ message, inviteOnly }: { message: string; inviteOnly: boolean }) {
  const config = usePublicConfig();
  const feedback = config.data?.feedbackUrl;
  return (
    <div className="mx-auto max-w-lg py-8">
      <EmptyState
        title={inviteOnly ? 'Closed beta' : 'Go Live is paused'}
        body={message}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {inviteOnly && feedback && (
              <a href={feedback} target="_blank" rel="noopener noreferrer">
                <Button variant="white">Ask for an invite</Button>
              </a>
            )}
            <Link href="/">
              <Button>Watch live streams</Button>
            </Link>
          </div>
        }
      />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="glass flex flex-col gap-3 rounded-card p-4">
      <p className="tag">
        {String(n).padStart(2, '0')} // {title}
      </p>
      {children}
    </div>
  );
}

function WalletPicker({
  wallets,
  selected,
  onSelect,
}: {
  wallets: MeWallet[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Wallet" className="flex flex-col gap-2">
      {wallets.map((w) => (
        <button
          key={w.id}
          role="radio"
          aria-checked={selected === w.id}
          disabled={!!w.liveStreamId}
          onClick={() => onSelect(w.id)}
          className={cx(
            'flex items-center gap-3 rounded-card border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
            selected === w.id ? 'border-primary bg-primary/15' : 'border-line hover:border-line-strong',
          )}
        >
          <span className="tag w-16">{w.family === 'solana' ? 'Solana' : 'EVM'}</span>
          <span className="font-mono">{shortAddress(w.address, 6)}</span>
          {w.source === 'embedded' && <span className="text-xs text-muted">APECAM wallet</span>}
          {w.liveStreamId && <span className="ml-auto text-xs font-semibold text-live">● live now</span>}
        </button>
      ))}
    </div>
  );
}

function TokenPicker(props: {
  wallet: MeWallet;
  chain: string;
  contract: string;
  onPick: (chain: string, contract: string) => void;
  onChain: (chain: string) => void;
  onContract: (value: string) => void;
  onCheck: () => void;
  checking: boolean;
}) {
  const holdings = useQuery({
    queryKey: ['wallet-tokens', props.wallet.id],
    queryFn: () => api<WalletTokensResponse>(`/api/me/tokens?walletId=${props.wallet.id}`),
    staleTime: 60_000,
  });
  const list = holdings.data?.tokens ?? [];
  return (
    <div className="flex flex-col gap-3">
      {holdings.isLoading ? (
        <Skeleton className="h-24" />
      ) : list.length > 0 ? (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label="Tokens in this wallet">
          {list.map((t) => (
            <li key={`${t.chain}:${t.contract}`}>
              <button
                onClick={() => props.onPick(t.chain, t.contract)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm hover:bg-white/5',
                  props.contract.toLowerCase() === t.contract.toLowerCase() && 'bg-primary/15',
                )}
              >
                <TokenAvatar logoUrl={t.logoUrl} ticker={t.ticker} contract={t.contract} size={28} />
                <span className="font-display font-bold">${t.ticker ?? '???'}</span>
                <span className="truncate text-xs text-muted">{t.name}</span>
                <span className="ml-auto font-mono text-xs">
                  {t.usdValue ? `$${t.usdValue}` : 'no price'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {holdings.data?.unsupported.length
            ? 'Token list is not available for this chain yet. Paste the contract address below.'
            : 'No tokens found in this wallet. Paste a contract address below.'}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {props.wallet.family === 'evm' && (
          <select
            value={props.chain}
            onChange={(e) => props.onChain(e.target.value)}
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
          value={props.contract}
          onChange={(e) => props.onContract(e.target.value)}
          placeholder="…or paste a token contract address"
          aria-label="Token contract address"
          className="h-10 min-w-0 flex-1 rounded-card border border-line bg-input px-3 font-mono text-sm focus:border-primary focus:outline-none"
        />
        <Button onClick={props.onCheck} disabled={props.checking || props.contract.trim().length < 20}>
          {props.checking ? 'Checking…' : 'Check'}
        </Button>
      </div>
    </div>
  );
}

function EligibilityCard({ e }: { e: Eligibility }) {
  return (
    <div
      role="status"
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

function CameraPreview({ enabled }: { enabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'on' | 'denied'>('idle');
  useEffect(() => {
    if (state !== 'on' || !enabled) return;
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setState('denied'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [state, enabled]);
  return (
    <aside className="glass flex h-fit flex-col gap-3 rounded-card p-4">
      <p className="tag">Preview</p>
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-card bg-black text-center text-xs text-muted">
        {!enabled ? (
          <span className="p-4">
            Your browser asks which screen, window or tab to share when you go live.
          </span>
        ) : state === 'on' ? (
          <video ref={video} autoPlay muted playsInline className="h-full w-full object-cover" />
        ) : null}
      </div>
      {enabled &&
        (state === 'denied' ? (
          <p className="text-sm text-live">
            Camera blocked. Click the camera icon in your browser’s address bar, allow access, then try again.
          </p>
        ) : (
          <Button size="sm" onClick={() => setState(state === 'on' ? 'idle' : 'on')}>
            {state === 'on' ? 'Stop preview' : 'Test camera'}
          </Button>
        ))}
    </aside>
  );
}

const END_MESSAGES: Record<string, string> = {
  holding_failed: 'Your stream was cut: the wallet no longer holds the $100 minimum.',
  admin_kill: 'Your stream was stopped by a moderator for breaking the content rules.',
  no_video: 'Your stream ended because no video was received for too long.',
  user_end: 'Stream ended.',
};

function LiveStudio({ session, onEnded }: { session: LiveSession; onEnded: (why: string) => void }) {
  const [connected, setConnected] = useState(true);
  const done = useRef(false);
  const finish = (why: string) => {
    if (done.current) return;
    done.current = true;
    setConnected(false);
    onEnded(why);
  };
  async function end() {
    await api(`/api/streams/${session.streamId}/end`, { body: {} }).catch(() => undefined);
    finish(END_MESSAGES.user_end!);
  }
  return (
    <LiveKitRoom
      serverUrl={session.wsUrl}
      token={session.token}
      connect={connected}
      video={session.source !== 'screen'}
      audio
      onDisconnected={() => finish('Disconnected from the stream.')}
      onError={(err) => finish(`Streaming error: ${err.message}`)}
      className="mx-auto flex max-w-5xl flex-col gap-4"
    >
      <LivePanel
        session={session}
        onEnd={end}
        onServerEnd={(reason) => finish(END_MESSAGES[reason] ?? 'Stream ended.')}
      />
    </LiveKitRoom>
  );
}

function LivePanel({
  session,
  onEnd,
  onServerEnd,
}: {
  session: LiveSession;
  onEnd: () => void;
  onServerEnd: (reason: string) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [screenError, setScreenError] = useState<string | null>(null);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [cutAt, setCutAt] = useState<number | null>(null);

  const status = useQuery({
    queryKey: ['stream-status', session.streamId],
    queryFn: () => api<StreamStatus>(`/api/streams/${session.streamId}/status`),
    refetchInterval: 10_000,
  });
  useEffect(() => {
    const s = status.data;
    if (!s) return;
    if (s.status === 'cut' || s.status === 'killed' || s.status === 'ended') onServerEnd(s.endReason ?? '');
    setCutAt(s.warningUntil ? new Date(s.warningUntil).getTime() : null);
  }, [status.data, onServerEnd]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Screen share starts once connected; the browser shows its own picker (screen / window / tab).
  async function shareScreen() {
    setScreenError(null);
    try {
      await localParticipant.setScreenShareEnabled(true, {
        audio: session.systemAudio,
        selfBrowserSurface: 'exclude',
      });
    } catch (err) {
      setScreenError(
        (err as Error).name === 'NotAllowedError'
          ? 'Screen sharing was cancelled or blocked. Try again and pick a screen, window or tab.'
          : `Could not share the screen: ${(err as Error).message}`,
      );
    }
  }
  const wantsScreen = session.source !== 'camera';
  useEffect(() => {
    if (!wantsScreen) return;
    const onConnected = () => void shareScreen();
    if (room.state === 'connected') onConnected();
    else room.once(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room, wantsScreen]);

  useDataChannel('system', (msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { type: string; cutAt?: string };
      if (data.type === 'holding_warning' && data.cutAt) setCutAt(new Date(data.cutAt).getTime());
      if (data.type === 'holding_ok') setCutAt(null);
      if (data.type === 'holding_cut') onServerEnd('holding_failed');
    } catch {
      // ignore malformed system messages
    }
  });

  const local = useTracks([Track.Source.ScreenShare, Track.Source.Camera]).filter(
    (t) => t.participant.isLocal,
  );
  const screen = local.find((t) => t.source === Track.Source.ScreenShare);
  const camera = local.find((t) => t.source === Track.Source.Camera);
  const main = screen ?? camera;
  const s = status.data;

  return (
    <>
      <div className="flex items-center gap-3">
        <LiveBadge />
        <h1 className="truncate font-display text-2xl font-bold">{session.title}</h1>
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
      {s?.blurred && (
        <div role="alert" className="rounded-card border border-live/50 bg-live/10 p-3 text-sm">
          Your stream is blurred for viewers while moderators review reports.
        </div>
      )}
      <div className="relative aspect-video overflow-hidden rounded-card bg-black">
        {main ? (
          <VideoTrack trackRef={main} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
            {wantsScreen ? 'Waiting for screen share…' : 'Starting camera…'}
          </div>
        )}
        {screen && camera && (
          <VideoTrack
            trackRef={camera}
            className="absolute bottom-3 right-3 h-24 w-24 rounded-full border-2 border-white/40 object-cover sm:h-32 sm:w-32"
          />
        )}
      </div>
      {screenError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-card border border-live/40 bg-live/10 p-3 text-sm"
        >
          {screenError}
          <Button size="sm" className="ml-auto" onClick={shareScreen}>
            Share screen
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="glass rounded-full px-3 py-1">{s?.viewers ?? 0} watching</span>
        <span className="glass rounded-full px-3 py-1">
          Holding check:{' '}
          {s?.lastCheck
            ? `${s.lastCheck.passed ? '✅' : '❌'} $${s.lastCheck.usdValue} · ${new Date(s.lastCheck.checkedAt).toLocaleTimeString()}`
            : '—'}
        </span>
        <Button variant="danger" className="ml-auto" onClick={onEnd}>
          End Stream
        </Button>
      </div>
      {s?.earn && <EarnPanel earn={s.earn} />}
    </>
  );
}
