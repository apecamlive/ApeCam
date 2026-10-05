import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Implementation Plan §5. Token amounts are raw integers (numeric(78,0)) to avoid float rounding.
const raw = (name: string) => numeric(name, { precision: 78, scale: 0 });
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ===== Identity =====
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['user', 'moderator', 'admin'] })
    .notNull()
    .default('user'),
  bannedUntil: ts('banned_until'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chainFamily: text('chain_family', { enum: ['solana', 'evm'] }).notNull(),
    address: text('address').notNull(), // EVM stored lowercase
    source: text('source', { enum: ['external', 'embedded'] })
      .notNull()
      .default('external'),
    isPayout: boolean('is_payout').notNull().default(false),
    verifiedAt: ts('verified_at').notNull(),
  },
  (t) => [
    unique('wallets_family_address').on(t.chainFamily, t.address),
    uniqueIndex('wallets_one_payout')
      .on(t.userId)
      .where(sql`${t.isPayout}`),
    uniqueIndex('wallets_one_embedded')
      .on(t.userId)
      .where(sql`${t.source} = 'embedded'`),
  ],
);

// ===== Tokens =====
export const tokens = pgTable(
  'tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chain: text('chain').notNull(),
    contract: text('contract').notNull(),
    ticker: text('ticker'),
    name: text('name'),
    logoUrl: text('logo_url'),
    logoSource: text('logo_source', { enum: ['dexscreener', 'launchpad', 'onchain', 'placeholder'] }),
    decimals: integer('decimals'),
    priceUsd: numeric('price_usd'),
    marketCapUsd: numeric('market_cap_usd'),
    change24h: numeric('change_24h'),
    liquidityUsd: numeric('liquidity_usd'),
    volume24hUsd: numeric('volume_24h_usd'),
    priceUpdatedAt: ts('price_updated_at'),
    buyUrl: text('buy_url'),
    chartUrl: text('chart_url'),
    hidden: boolean('hidden').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('tokens_chain_contract').on(t.chain, t.contract),
    index('tokens_ticker_trgm').using('gin', sql`${t.ticker} gin_trgm_ops`),
  ],
);

// ===== Streams =====
export const STREAM_STATUSES = ['starting', 'live', 'ended', 'cut', 'killed'] as const;
export const streams = pgTable(
  'streams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    title: text('title').notNull(),
    source: text('source', { enum: ['camera', 'screen', 'screen_camera'] }).notNull(),
    status: text('status', { enum: STREAM_STATUSES }).notNull(),
    endReason: text('end_reason', {
      enum: ['user_end', 'holding_failed', 'admin_kill', 'no_video', 'error', 'disconnected'],
    }),
    livekitRoom: text('livekit_room').notNull().unique(),
    startedAt: ts('started_at'),
    endedAt: ts('ended_at'),
    currentViewers: integer('current_viewers').notNull().default(0),
    peakViewers: integer('peak_viewers').notNull().default(0),
    blurred: boolean('blurred').notNull().default(false),
    thumbnailUrl: text('thumbnail_url'),
    lastFrameOkAt: ts('last_frame_ok_at'),
    warningUntil: ts('warning_until'),
    rpcFailures: integer('rpc_failures').notNull().default(0),
    egressId: text('egress_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    // D15: one active stream per wallet.
    uniqueIndex('streams_one_active_per_wallet')
      .on(t.walletId)
      .where(sql`${t.status} in ('starting','live')`),
    index('streams_live').on(t.status, t.startedAt),
    index('streams_token').on(t.tokenId, t.status),
    index('streams_user').on(t.userId, t.startedAt),
  ],
);

export const holdingChecks = pgTable(
  'holding_checks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    streamId: uuid('stream_id').references(() => streams.id),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    tokenId: uuid('token_id')
      .notNull()
      .references(() => tokens.id),
    rawBalance: raw('raw_balance').notNull(),
    priceUsd: numeric('price_usd').notNull(),
    usdValue: numeric('usd_value').notNull(),
    passed: boolean('passed').notNull(),
    error: text('error'),
    checkedAt: ts('checked_at').notNull().defaultNow(),
  },
  (t) => [index('holding_checks_stream').on(t.streamId, t.checkedAt)],
);

export const streamMinutes = pgTable(
  'stream_minutes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    streamId: uuid('stream_id')
      .notNull()
      .references(() => streams.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    minuteAt: ts('minute_at').notNull(),
    viewers: integer('viewers').notNull(),
    holdingOk: boolean('holding_ok').notNull(),
    viewersOk: boolean('viewers_ok').notNull(),
    videoOk: boolean('video_ok').notNull(),
    noReportOk: boolean('no_report_ok').notNull(),
    valid: boolean('valid').notNull(),
  },
  (t) => [
    unique('stream_minutes_stream_minute').on(t.streamId, t.minuteAt),
    index('stream_minutes_user_day')
      .on(t.userId, t.minuteAt)
      .where(sql`${t.valid}`),
  ],
);

// ===== Stream to Earn =====
export const payoutBatches = pgTable('payout_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodFrom: date('period_from').notNull(),
  periodTo: date('period_to').notNull(),
  totalApecam: raw('total_apecam').notNull(),
  scaleFactor: numeric('scale_factor').notNull().default('1'),
  status: text('status', { enum: ['draft', 'exported', 'partially_paid', 'paid'] }).notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const rewards = pgTable(
  'rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    period: date('period').notNull(),
    validMinutes: integer('valid_minutes').notNull(),
    apecamAmount: raw('apecam_amount').notNull(),
    scaleFactor: numeric('scale_factor').notNull().default('1'),
    status: text('status', { enum: ['pending', 'batched', 'paid', 'void'] }).notNull(),
    payoutBatchId: uuid('payout_batch_id').references(() => payoutBatches.id),
    payoutWallet: text('payout_wallet'),
    payoutTxHash: text('payout_tx_hash'),
    paidAt: ts('paid_at'),
    voidReason: text('void_reason'),
  },
  (t) => [unique('rewards_user_period').on(t.userId, t.period)],
);

export const treasuryTransfers = pgTable(
  'treasury_transfers',
  {
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    toAddress: text('to_address').notNull(),
    amount: raw('amount').notNull(),
    blockTime: ts('block_time').notNull(),
    matchedRewardIds: uuid('matched_reward_ids').array(),
  },
  (t) => [primaryKey({ columns: [t.txHash, t.logIndex] })],
);

// ===== Moderation & chat =====
export const REPORT_CATEGORIES = [
  'violence',
  'sexual',
  'hate',
  'scam',
  'self_harm',
  'illegal',
  'spam',
  'other',
] as const;
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    streamId: uuid('stream_id')
      .notNull()
      .references(() => streams.id),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id),
    category: text('category', { enum: REPORT_CATEGORIES }).notNull(),
    reason: text('reason'),
    snapshotUrl: text('snapshot_url'),
    status: text('status', { enum: ['open', 'actioned', 'dismissed'] })
      .notNull()
      .default('open'),
    handledBy: uuid('handled_by').references(() => users.id),
    handledAt: ts('handled_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('reports_one_per_user').on(t.streamId, t.reporterUserId),
    index('reports_open')
      .on(t.status, t.createdAt)
      .where(sql`${t.status} = 'open'`),
  ],
);

export const modActions = pgTable('mod_actions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason'),
  meta: jsonb('meta'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    streamId: uuid('stream_id')
      .notNull()
      .references(() => streams.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('chat_stream').on(t.streamId, t.createdAt)],
);

// ===== Tracker =====
export const buybacks = pgTable(
  'buybacks',
  {
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    apecamAmount: raw('apecam_amount').notNull(),
    spentAmount: raw('spent_amount').notNull(),
    spentAsset: text('spent_asset').notNull(),
    usdValue: numeric('usd_value'),
    avgPriceUsd: numeric('avg_price_usd'),
    final: boolean('final').notNull().default(false),
    boughtAt: ts('bought_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.txHash, t.logIndex] })],
);

export const burns = pgTable(
  'burns',
  {
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    fromAddress: text('from_address').notNull(),
    amount: raw('amount').notNull(),
    usdValue: numeric('usd_value'),
    final: boolean('final').notNull().default(false),
    burnedAt: ts('burned_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.txHash, t.logIndex] })],
);

/**
 * Closed beta (Sprint 5, risk R4): wallets allowed to go live while `go_live.access` is 'invite'. Keyed by
 * address so streamers can be invited before they ever sign in. EVM addresses lowercase, Solana as-is.
 */
export const goLiveInvites = pgTable('go_live_invites', {
  address: text('address').primaryKey(),
  note: text('note'),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const syncCursors = pgTable('sync_cursors', {
  name: text('name').primaryKey(),
  lastBlock: bigint('last_block', { mode: 'number' }).notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

// ===== Config =====
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
