import { normalizeAddress, type ChainFamily } from '@apecam/chain';
import { rewards, streamMinutes, streams, tokens, users, wallets } from '@apecam/db';
import { ApiError } from '@apecam/shared';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { CoreDeps } from './deps';

type WalletRow = typeof wallets.$inferSelect;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * Links an additional wallet to a signed-in user (S2-6). The caller must already have verified a
 * sign-in signature from that wallet. A wallet that belongs to another user is refused (no merges in MVP).
 */
export async function linkWallet(
  deps: CoreDeps,
  args: { userId: string; family: ChainFamily; address: string; source?: WalletRow['source'] },
): Promise<WalletRow> {
  const address = normalizeAddress(args.family, args.address);
  const [existing] = await deps.db
    .select()
    .from(wallets)
    .where(and(eq(wallets.chainFamily, args.family), eq(wallets.address, address)));
  if (existing) {
    if (existing.userId !== args.userId)
      throw new ApiError(409, 'WALLET_TAKEN', 'This wallet belongs to another APECAM account');
    return existing;
  }
  try {
    const [row] = await deps.db
      .insert(wallets)
      .values({
        userId: args.userId,
        chainFamily: args.family,
        address,
        source: args.source ?? 'external',
        verifiedAt: deps.now?.() ?? new Date(),
      })
      .returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ApiError(409, 'WALLET_TAKEN', 'This wallet belongs to another APECAM account');
    throw err;
  }
}

/** Stream to Earn pays $APECAM on Robinhood Chain, so only an EVM wallet can be the payout wallet (D7). */
export async function setPayoutWallet(deps: CoreDeps, args: { userId: string; walletId: string }) {
  const [wallet] = await deps.db
    .select()
    .from(wallets)
    .where(and(eq(wallets.id, args.walletId), eq(wallets.userId, args.userId)));
  if (!wallet) throw new ApiError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
  if (wallet.chainFamily !== 'evm') {
    throw new ApiError(400, 'PAYOUT_MUST_BE_EVM', '$APECAM is paid on Robinhood Chain: pick an EVM wallet');
  }
  await deps.db.transaction(async (tx) => {
    await tx.update(wallets).set({ isPayout: false }).where(eq(wallets.userId, args.userId));
    await tx.update(wallets).set({ isPayout: true }).where(eq(wallets.id, wallet.id));
  });
  return { walletId: wallet.id, address: wallet.address };
}

const RESERVED = /apecam|admin|moderator|official|support/i;

export function validateDisplayName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 32)
    throw new ApiError(400, 'NAME_LENGTH', 'Display name must be 2–32 characters');
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name))
    throw new ApiError(400, 'NAME_CHARS', 'Use letters, numbers, spaces, _ . -');
  if (RESERVED.test(name)) throw new ApiError(400, 'NAME_RESERVED', 'That name is reserved');
  return name;
}

export async function updateDisplayName(deps: CoreDeps, userId: string, raw: string | null) {
  const displayName = raw === null || raw.trim() === '' ? null : validateDisplayName(raw);
  await deps.db.update(users).set({ displayName }).where(eq(users.id, userId));
  return { displayName };
}

export const AVATAR_MAX_BYTES = 1_000_000;

/** Stores an already re-encoded avatar (the web layer resizes to 256px WebP, stripping metadata). */
export async function setAvatar(deps: CoreDeps, userId: string, webp: Uint8Array) {
  if (!deps.files) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured');
  const key = `avatars/${userId}/${Date.now()}.webp`;
  const avatarUrl = await deps.files.put(key, webp, 'image/webp');
  await deps.db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  return { avatarUrl };
}

/**
 * Registers the user's Privy embedded wallet (D7, §4.10). The address is read from Privy's server API,
 * never from the request body, so a client cannot point payouts at an arbitrary address.
 */
export async function registerEmbeddedWallet(deps: CoreDeps, userId: string) {
  if (!deps.embeddedWallets)
    throw new ApiError(503, 'EMBEDDED_WALLETS_UNAVAILABLE', 'Embedded wallets are not configured');
  const address = await deps.embeddedWallets.getEvmWallet(userId);
  if (!address) throw new ApiError(409, 'EMBEDDED_WALLET_MISSING', 'Create the embedded wallet first');
  const wallet = await linkWallet(deps, { userId, family: 'evm', address, source: 'embedded' });
  const [payout] = await deps.db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.isPayout, true)));
  if (!payout) await deps.db.update(wallets).set({ isPayout: true }).where(eq(wallets.id, wallet.id));
  return { walletId: wallet.id, address: wallet.address, isPayout: !payout || payout.id === wallet.id };
}

/** Public identity at /u/{wallet} (Dev Brief: wallet identity). Any linked wallet resolves to the same user. */
export async function getPublicProfile(deps: CoreDeps, rawAddress: string) {
  const [row] = await deps.db
    .select({ user: users, wallet: wallets })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(inArray(wallets.address, [rawAddress, rawAddress.toLowerCase()]));
  if (!row) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'No APECAM profile for this wallet');
  const { user } = row;

  const history = await deps.db
    .select({
      id: streams.id,
      title: streams.title,
      status: streams.status,
      startedAt: streams.startedAt,
      endedAt: streams.endedAt,
      peakViewers: streams.peakViewers,
      ticker: tokens.ticker,
      chain: tokens.chain,
      contract: tokens.contract,
      logoUrl: tokens.logoUrl,
    })
    .from(streams)
    .innerJoin(tokens, eq(tokens.id, streams.tokenId))
    .where(and(eq(streams.userId, user.id), isNotNull(streams.startedAt)))
    .orderBy(desc(streams.startedAt))
    .limit(50);

  const [counts] = (await deps.db
    .select({
      streams: sql<number>`count(*)::int`,
      tokens: sql<number>`count(distinct ${streams.tokenId})::int`,
    })
    .from(streams)
    .where(and(eq(streams.userId, user.id), isNotNull(streams.startedAt)))) as [
    { streams: number; tokens: number },
  ];
  const [minutes] = (await deps.db
    .select({ n: sql<number>`count(distinct date_trunc('minute', ${streamMinutes.minuteAt}))::int` })
    .from(streamMinutes)
    .where(and(eq(streamMinutes.userId, user.id), eq(streamMinutes.valid, true)))) as [{ n: number }];
  const earned = await deps.db
    .select({ status: rewards.status, total: sql<string>`coalesce(sum(${rewards.apecamAmount}), 0)::text` })
    .from(rewards)
    .where(eq(rewards.userId, user.id))
    .groupBy(rewards.status);
  const sum = (s: string[]) =>
    earned.filter((e) => s.includes(e.status)).reduce((n, e) => n + BigInt(e.total), 0n);
  const payouts = await deps.db
    .select({
      period: rewards.period,
      amount: rewards.apecamAmount,
      txHash: rewards.payoutTxHash,
      paidAt: rewards.paidAt,
    })
    .from(rewards)
    .where(and(eq(rewards.userId, user.id), eq(rewards.status, 'paid')))
    .orderBy(desc(rewards.paidAt))
    .limit(50);

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
    address: row.wallet.address,
    stats: {
      streams: counts.streams,
      tokens: counts.tokens,
      validMinutes: minutes.n,
      earnedRaw: sum(['pending', 'batched', 'paid']).toString(),
      pendingRaw: sum(['pending', 'batched']).toString(),
      paidRaw: sum(['paid']).toString(),
    },
    history: history.map((h) => ({
      ...h,
      durationSec:
        h.startedAt && h.endedAt ? Math.round((h.endedAt.getTime() - h.startedAt.getTime()) / 1000) : null,
    })),
    payouts,
  };
}
