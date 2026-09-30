/** Browser-side fetch helper. Every APECAM endpoint returns `{ error: { code, message, details } }` on failure. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      json.error?.code ?? 'HTTP_ERROR',
      json.error?.message ?? `Request failed (${res.status})`,
      json.error?.details,
    );
  }
  return json as T;
}

// Response shapes used by the UI.
export interface MeWallet {
  id: string;
  family: 'evm' | 'solana';
  address: string;
  isPayout: boolean;
  source: 'external' | 'embedded';
  /** Set when this wallet is live right now (D15: one live stream per wallet). */
  liveStreamId: string | null;
}

export interface MeResponse {
  user: {
    id: string;
    role: 'user' | 'moderator' | 'admin';
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  wallets: MeWallet[];
  /** Absent when signed out. */
  goLive?: GoLiveAccessInfo;
}

export type GoLiveMode = 'open' | 'invite' | 'closed';
export type GoLiveAccessInfo =
  | { mode: GoLiveMode; allowed: true }
  | { mode: GoLiveMode; allowed: false; code: 'GO_LIVE_CLOSED' | 'GO_LIVE_INVITE_ONLY'; message: string };

export interface PublicConfig {
  goLiveAccess: GoLiveMode;
  feedbackUrl: string | null;
}

export interface WalletTokensResponse {
  tokens: {
    chain: string;
    contract: string;
    ticker: string | null;
    name: string | null;
    logoUrl: string | null;
    usdValue: string | null;
  }[];
  unsupported: string[];
}

export interface StreamStatus {
  status: 'starting' | 'live' | 'ended' | 'cut' | 'killed';
  endReason: string | null;
  viewers: number;
  peakViewers: number;
  startedAt: string | null;
  blurred: boolean;
  warningUntil: string | null;
  lastCheck: { passed: boolean; usdValue: string; checkedAt: string } | null;
  earn: {
    validMinutesToday: number;
    earnedTodayRaw: string;
    nextTier: { minutes: number; total: number } | null;
    lastMinute: { minuteAt: string; valid: boolean; viewers: number; failures: string[] } | null;
  };
}

/** Why the last minute did not count toward Stream to Earn (Studio, S3-9). */
export const MINUTE_FAILURES: Record<string, string> = {
  holding: 'Holding re-check is missing or below $100',
  viewers: 'Fewer than 3 signed-in viewers (accounts older than 24h)',
  video: 'No live video detected in the last 2 minutes',
  report: 'Open report under moderator review',
  blurred: 'Stream is blurred for review',
};

export interface TrackerSummary {
  boughtBackRaw: string;
  boughtBackUsd: string;
  burnedRaw: string;
  burnedPercent: number;
  totalSupplyRaw: string;
  circulatingRaw: string;
  treasuryRaw: string;
  paidOutRaw: string;
  lastBuybackAt: string | null;
  lastBurnAt: string | null;
  lastSyncedAt: string | null;
  syncedToBlock: number | null;
  burnIndexMatchesChain: boolean;
  contract: string;
  wallets: {
    role: 'creatorFee' | 'operations' | 'buyback' | 'burn' | 'treasury';
    address: string;
    balanceRaw: string;
  }[];
}

export interface BuybackRow {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  apecamAmount: string;
  spentAmount: string;
  spentAsset: string;
  usdValue: string | null;
  avgPriceUsd: string | null;
  boughtAt: string;
}

export interface BurnRow {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  fromAddress: string;
  amount: string;
  usdValue: string | null;
  burnedAt: string;
}

/** 18-decimal raw amount → number of whole tokens (display only; never for money math). */
export const tokens18 = (raw: string | bigint) => Number(BigInt(raw) / 10n ** 12n) / 1e6;

export const REPORT_CATEGORIES = [
  { id: 'violence', label: 'Violence or threats' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'hate', label: 'Hate or harassment' },
  { id: 'scam', label: 'Scam or impersonation' },
  { id: 'self_harm', label: 'Self-harm' },
  { id: 'illegal', label: 'Illegal activity' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Something else' },
] as const;

export interface FeedItem {
  streamId: string;
  title: string;
  thumbnailUrl: string | null;
  startedAt: string | null;
  viewers: number;
  token: {
    chain: string;
    contract: string;
    ticker: string | null;
    name: string | null;
    logoUrl: string | null;
    marketCapUsd: string | null;
  };
  streamer: { userId: string; displayName: string | null; address: string };
}

export interface TokenPage {
  token: {
    chain: string;
    contract: string;
    ticker: string | null;
    name: string | null;
    logoUrl: string | null;
    priceUsd: string | null;
    marketCapUsd: string | null;
    change24h: string | null;
    chartUrl: string | null;
    buyUrl: string | null;
  };
  streams: {
    id: string;
    title: string;
    viewers: number;
    startedAt: string | null;
    blurred: boolean;
    source: string;
    streamer: { userId: string; displayName: string | null; avatarUrl: string | null; address: string };
  }[];
}

export interface ChatMessage {
  id: number;
  userId: string;
  name: string;
  body: string;
  at: string;
}

export interface SearchResult {
  chain: string;
  contract: string;
  ticker: string | null;
  name: string | null;
  logoUrl: string | null;
  marketCapUsd: string | null;
  live: number;
}

export interface Eligibility {
  passed: boolean;
  reasons: string[];
  usdValue: string | null;
  minUsd: number;
  shortfallUsd: string | null;
  token: {
    chain: string;
    contract: string;
    ticker: string | null;
    name: string | null;
    logoUrl: string | null;
  };
}

/** Human text for every eligibility code (Studio, S2-2 / S4-3). */
export const ELIGIBILITY_MESSAGES: Record<string, string> = {
  INSUFFICIENT_HOLDING: 'This wallet holds less than the minimum for this token.',
  LOW_LIQUIDITY: 'This token is too illiquid to price reliably, so it cannot be streamed yet.',
  PRICE_UNAVAILABLE: 'No market price found for this token.',
  TOKEN_HIDDEN: 'This token has been hidden by moderators.',
  USER_BANNED: 'This account is banned.',
  WALLET_ALREADY_LIVE: 'This wallet is already live. End that stream or pick another wallet.',
  WALLET_NOT_OWNED: 'Pick a wallet on the same chain as the token.',
  RPC_UNAVAILABLE: 'Could not read the chain right now. Try again in a moment.',
};
