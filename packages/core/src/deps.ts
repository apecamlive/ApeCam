import type { ChainAdapters } from '@apecam/chain';
import type { Db } from '@apecam/db';
import type { TokenQuote } from '@apecam/pricing';
import type { AppConfig, KeyValueStore } from '@apecam/shared';
import type { Outflow, TransferLog } from '@apecam/tracker';
import type { StreamingProvider } from './streaming';

export interface PriceLookup {
  getQuote(chainSlug: string, contract: string): Promise<TokenQuote | null>;
  /** Bypasses the cache (worker `refresh-prices`). */
  refresh(chainSlug: string, contracts: string[]): Promise<Map<string, TokenQuote | null>>;
}

/** Where LiveKit Egress drops stream snapshots (Cloudflare R2). */
export interface SnapshotStore {
  latest(prefix: string): Promise<{ key: string; url: string } | null>;
  read(key: string): Promise<Uint8Array>;
}

/** Thrown by `transferLogs` when a window matches too many logs; the caller halves the window. */
export class LogLimitError extends Error {}

/** Read-only view of $APECAM on Robinhood Chain for the tracker and payout matching (§9). */
export interface ApecamChainSource {
  /** Highest block with the `safe` tag (~9 min behind head, ADR 001). */
  safeBlock(): Promise<number>;
  blockTime(block: number): Promise<Date>;
  transferLogs(fromBlock: number, toBlock: number): Promise<TransferLog[]>;
  /** Assets that left `address` in the given transactions (ETH incl. internal transfers, ERC-20s). */
  outflows(address: string, txHashes: string[], fromBlock: number, toBlock: number): Promise<Outflow[]>;
  balanceOf(address: string): Promise<bigint>;
  totalSupply(): Promise<bigint>;
}

export interface ApecamConfig {
  contract: string;
  wallets: { creatorFee: string; operations: string; buyback: string; burn: string; treasury: string };
  deployBlock: number;
  /** Supply at launch (1B × 10^18), for "% of supply burned". */
  initialSupply: bigint;
  source: ApecamChainSource;
}

/** Public file storage (avatars). Cloudflare R2 in production. */
export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
}

/** Moderator alerts (Telegram/Discord). Implementations must never throw into the caller. */
export interface ModNotifier {
  send(text: string): Promise<void>;
}

/** Server-side view of a Privy user (embedded wallets, Implementation Plan §4.10). */
export interface EmbeddedWalletProvider {
  /** EVM address of the user's Privy embedded wallet, looked up server-side by our user id. */
  getEvmWallet(userId: string): Promise<string | null>;
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
  files?: FileStore;
  /** PRIVATE bucket for database backups (S4-10). Never the public thumbnails bucket. */
  backups?: FileStore;
  notifier?: ModNotifier;
  embeddedWallets?: EmbeddedWalletProvider;
  /** Absent until the owner provides the contract + wallet addresses (D17); tracker and payouts are skipped. */
  apecam?: ApecamConfig;
  config: () => Promise<AppConfig>;
  now?: () => Date;
  log?: Logger;
}

export const consoleLogger: Logger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', msg, ...obj })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', msg, ...obj })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', msg, ...obj })),
};
