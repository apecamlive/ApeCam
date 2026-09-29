import type { ChainAdapters } from '@apecam/chain';
import type { Db } from '@apecam/db';
import type { TokenQuote } from '@apecam/pricing';
import type { AppConfig, KeyValueStore } from '@apecam/shared';
import type { StreamingProvider } from './streaming';

export interface PriceLookup {
  getQuote(chainSlug: string, contract: string): Promise<TokenQuote | null>;
  /** Bypasses the cache (worker `refresh-prices`). */
  refresh(chainSlug: string, contracts: string[]): Promise<Map<string, TokenQuote | null>>;
}

/** Where LiveKit Egress drops stream snapshots (Cloudflare R2). */
export interface SnapshotStore {
  latest(prefix: string): Promise<{ key: string; url: string } | null>;
}

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Everything the domain logic needs. Web and worker build one of these; tests build fakes. */
export interface CoreDeps {
  db: Db;
  chains: ChainAdapters;
  prices: PriceLookup;
  streaming: StreamingProvider;
  kv: KeyValueStore;
  /** Absent until R2 is configured; thumbnails are then skipped. */
  snapshots?: SnapshotStore;
  config: () => Promise<AppConfig>;
  now?: () => Date;
  log?: Logger;
}

export const consoleLogger: Logger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', msg, ...obj })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', msg, ...obj })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', msg, ...obj })),
};
