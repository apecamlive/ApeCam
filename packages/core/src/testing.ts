import type { ChainAdapter, ChainAdapters, ChainId, TokenHolding, TokenMeta } from '@apecam/chain';
import { ChainRpcError, HoldingsUnsupportedError } from '@apecam/chain';
import { tokens, users, wallets } from '@apecam/db';
import { createTestDb } from '@apecam/db/testing';
import type { TokenQuote } from '@apecam/pricing';
import { APP_CONFIG_DEFAULTS, MemoryKeyValueStore, type AppConfig } from '@apecam/shared';
import type { Outflow, TransferLog } from '@apecam/tracker';
import type { WebhookEvent } from 'livekit-server-sdk';
import {
  LogLimitError,
  type ApecamChainSource,
  type CoreDeps,
  type EmbeddedWalletProvider,
  type FileStore,
  type ModNotifier,
  type PriceLookup,
  type SnapshotStore,
} from './deps';
import type { StreamingProvider } from './streaming';

/** Chain adapter whose balances and metadata are set by the test. */
export class FakeChainAdapter implements ChainAdapter {
  balances = new Map<string, bigint>();
  meta = new Map<string, TokenMeta>();
  failing = false;
  constructor(
    readonly chain: ChainId,
    readonly family: 'solana' | 'evm',
  ) {}
  isValidAddress(address: string) {
    return this.family === 'evm'
      ? /^0x[0-9a-fA-F]{40}$/.test(address)
      : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  async getBalance(wallet: string, contract: string): Promise<TokenHolding> {
    if (this.failing) throw new ChainRpcError('fake rpc down');
    const m = await this.getTokenMeta(contract);
    return { contract, rawBalance: this.balances.get(`${wallet}:${contract}`) ?? 0n, decimals: m.decimals };
  }
  async getTokenMeta(contract: string): Promise<TokenMeta> {
    if (this.failing) throw new ChainRpcError('fake rpc down');
    return this.meta.get(contract) ?? { contract, decimals: 18, name: 'Test Token', ticker: 'TEST' };
  }
  listingSupported = true;
  async listHoldings(wallet: string): Promise<TokenHolding[]> {
    if (!this.listingSupported) throw new HoldingsUnsupportedError('fake: no token API');
    if (this.failing) throw new ChainRpcError('fake rpc down');
    return [...this.balances]
      .filter(([k, v]) => k.startsWith(`${wallet}:`) && v > 0n)
      .map(([k, v]) => ({ contract: k.split(':')[1]!, rawBalance: v, decimals: 18 }));
  }
}

export class FakeNotifier implements ModNotifier {
  sent: string[] = [];
  async send(text: string) {
    this.sent.push(text);
  }
}

export class FakeFiles implements FileStore {
  stored = new Map<string, { body: Uint8Array; contentType: string }>();
  async put(key: string, body: Uint8Array, contentType: string) {
    this.stored.set(key, { body, contentType });
    return `https://files.test/${key}`;
  }
}

export class FakeEmbeddedWallets implements EmbeddedWalletProvider {
  byUser = new Map<string, string>();
  async getEvmWallet(userId: string) {
    return this.byUser.get(userId) ?? null;
  }
}

export class FakePrices implements PriceLookup {
  quotes = new Map<string, TokenQuote | null>();
  refreshed: string[][] = [];
  async getQuote(_chain: string, contract: string) {
    return this.quotes.get(contract) ?? null;
  }
  async refresh(_chain: string, contracts: string[]) {
    this.refreshed.push(contracts);
    return new Map(contracts.map((c) => [c, this.quotes.get(c) ?? null]));
  }
}

export class FakeSnapshots implements SnapshotStore {
  objects = new Map<string, string>();
  bytes = new Map<string, Uint8Array>();
  async latest(prefix: string) {
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const key = keys.at(-1);
    return key ? { key, url: this.objects.get(key)! } : null;
  }
  async read(key: string) {
    const b = this.bytes.get(key);
    if (!b) throw new Error(`no snapshot bytes for ${key}`);
    return b;
  }
  /** Adds a snapshot image (JPEG bytes) under the stream's Egress prefix. */
  add(streamId: string, name: string, image: Uint8Array) {
    const key = `thumbs/${streamId}/${name}`;
    this.objects.set(key, `https://cdn.test/${key}`);
    this.bytes.set(key, image);
    return key;
  }
}

/** In-memory $APECAM chain: logs, balances and buyback outflows set by the test. */
export class FakeApecamSource implements ApecamChainSource {
  head = 1_000;
  logs: TransferLog[] = [];
  outflowList: Outflow[] = [];
  balances = new Map<string, bigint>();
  supply = 10n ** 9n * 10n ** 18n;
  /** Throw LogLimitError for windows wider than this, to exercise window halving. */
  maxWindow = Infinity;
  windowsRequested: [number, number][] = [];
  async safeBlock() {
    return this.head;
  }
  async blockTime(block: number) {
    return new Date(Date.UTC(2026, 9, 1) + block * 1000);
  }
  async transferLogs(from: number, to: number) {
    this.windowsRequested.push([from, to]);
    if (to - from + 1 > this.maxWindow)
      throw new LogLimitError('logs matched by query exceeds limit of 10000');
    return this.logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
  }
  async outflows(_address: string, txHashes: string[]) {
    return this.outflowList.filter((o) => txHashes.includes(o.txHash));
  }
  async balanceOf(address: string) {
    return this.balances.get(address.toLowerCase()) ?? 0n;
  }
  async totalSupply() {
    return this.supply;
  }
}

export const APECAM_TEST = {
  contract: '0xa9ec000000000000000000000000000000000001',
  wallets: {
    creatorFee: '0xc0ee000000000000000000000000000000000001',
    operations: '0x0b50000000000000000000000000000000000001',
    buyback: '0xbbbb000000000000000000000000000000000001',
    burn: '0x000000000000000000000000000000000000dead',
    treasury: '0x7777000000000000000000000000000000000001',
  },
};

export function quote(priceUsd: string, over: Partial<TokenQuote> = {}): TokenQuote {
  return {
    priceUsd,
    marketCapUsd: 1_000_000,
    liquidityUsd: 50_000,
    volume24hUsd: 20_000,
    change24h: 1.5,
    dexId: 'uniswap',
    pairUrl: 'https://dexscreener.com/base/0xpair',
    name: 'Test Token',
    ticker: 'TEST',
    imageUrl: 'https://img/test.png',
    ...over,
  };
}

/** Records every call so tests can assert on LiveKit side effects without a LiveKit server. */
export class FakeStreaming implements StreamingProvider {
  readonly wsUrl = 'wss://fake.livekit';
  rooms = new Map<string, Set<string>>();
  sent: { room: string; topic: string; payload: unknown; to?: string[] }[] = [];
  removed: { room: string; identity: string }[] = [];
  deleted: string[] = [];
  failCreate = false;
  async createRoom(room: string) {
    if (this.failCreate) throw new Error('livekit down');
    this.rooms.set(room, new Set());
  }
  async deleteRoom(room: string) {
    this.deleted.push(room);
    this.rooms.delete(room);
  }
  async removeParticipant(room: string, identity: string) {
    this.removed.push({ room, identity });
    this.rooms.get(room)?.delete(identity);
  }
  async sendData(room: string, topic: string, payload: object, to?: string[]) {
    this.sent.push({ room, topic, payload, to });
  }
  async listParticipantIdentities(room: string) {
    return [...(this.rooms.get(room) ?? [])];
  }
  join(room: string, identity: string) {
    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room)!.add(identity);
  }
  leave(room: string, identity: string) {
    this.rooms.get(room)?.delete(identity);
  }
  async roomExists(room: string) {
    return this.rooms.has(room);
  }
  async publisherToken(room: string, identity: string) {
    return `pub-token:${room}:${identity}`;
  }
  async viewerToken(room: string, identity: string) {
    return `view-token:${room}:${identity}`;
  }
  async receiveWebhook(body: string) {
    return JSON.parse(body) as WebhookEvent;
  }
  snapshotsStarted: string[] = [];
  async startSnapshots(room: string) {
    this.snapshotsStarted.push(room);
    return `egress_${room}`;
  }
  stoppedEgress: string[] = [];
  async stopEgress(id: string) {
    this.stoppedEgress.push(id);
  }
}

export const TEST_EVM_TOKEN = '0x00000000000000000000000000000000000000aa';
export const TEST_EVM_WALLET = '0x00000000000000000000000000000000000000b1';

/** A fully wired CoreDeps on an in-memory Postgres with fake chain, prices and LiveKit. */
export async function createTestContext(configOverrides: Partial<AppConfig> = {}) {
  const { db, close } = await createTestDb();
  const evm = new FakeChainAdapter('base', 'evm');
  const sol = new FakeChainAdapter('solana', 'solana');
  const chains: ChainAdapters = { get: (id) => (id === 'solana' ? sol : evm) };
  const prices = new FakePrices();
  const streaming = new FakeStreaming();
  const snapshots = new FakeSnapshots();
  const files = new FakeFiles();
  const backups = new FakeFiles();
  const notifier = new FakeNotifier();
  const embeddedWallets = new FakeEmbeddedWallets();
  const apecamSource = new FakeApecamSource();
  let now = new Date('2026-10-01T12:00:00Z');
  const kv = new MemoryKeyValueStore(() => now.getTime());
  const config = { ...APP_CONFIG_DEFAULTS, ...configOverrides };
  const deps: CoreDeps = {
    db,
    chains,
    prices,
    streaming,
    kv,
    snapshots,
    files,
    backups,
    notifier,
    embeddedWallets,
    apecam: {
      ...APECAM_TEST,
      deployBlock: 1,
      initialSupply: 10n ** 9n * 10n ** 18n,
      source: apecamSource,
    },
    config: async () => config,
    now: () => now,
  };

  async function createUser(
    opts: { wallets?: number; bannedUntil?: Date; role?: 'user' | 'moderator' | 'admin' } = {},
  ) {
    const [user] = await db
      .insert(users)
      .values({ bannedUntil: opts.bannedUntil, role: opts.role ?? 'user' })
      .returning();
    const ws = [];
    for (let i = 0; i < (opts.wallets ?? 1); i++) {
      const address = `0x${user!.id.replaceAll('-', '').slice(0, 32)}${i.toString(16).padStart(8, '0')}`;
      const [w] = await db
        .insert(wallets)
        .values({ userId: user!.id, chainFamily: 'evm', address, verifiedAt: now })
        .returning();
      ws.push(w!);
    }
    return { user: user!, wallets: ws };
  }

  /** Gives `wallet` `usd` dollars of the test token at $1. */
  function fund(walletAddress: string, usd: number, contract = TEST_EVM_TOKEN) {
    evm.balances.set(`${walletAddress}:${contract}`, BigInt(usd) * 10n ** 18n);
    if (!prices.quotes.has(contract)) prices.quotes.set(contract, quote('1'));
  }

  return {
    deps,
    db,
    evm,
    sol,
    prices,
    streaming,
    snapshots,
    files,
    backups,
    notifier,
    embeddedWallets,
    apecamSource,
    kv,
    config,
    tokens,
    createUser,
    fund,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    close,
  };
}
