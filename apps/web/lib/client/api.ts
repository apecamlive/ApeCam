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
export interface MeResponse {
  user: { id: string; role: string; displayName: string | null; avatarUrl: string | null } | null;
  wallets: { id: string; family: 'evm' | 'solana'; address: string; isPayout: boolean; source: string }[];
}

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
