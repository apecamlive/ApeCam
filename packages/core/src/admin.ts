import { CHAINS, normalizeAddress, type ChainId } from '@apecam/chain';
import {
  appConfig,
  chatMessages,
  goLiveInvites,
  modActions,
  reports,
  streams,
  tokens,
  users,
  wallets,
} from '@apecam/db';
import { ApiError, kvKeys, type GoLiveAccess } from '@apecam/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { readGoLiveAccess } from './access';
import type { CoreDeps } from './deps';
import { getStream, terminateStream } from './streams';

type Target = 'stream' | 'user' | 'wallet' | 'token' | 'report' | 'chat' | 'config';

async function log(
  deps: CoreDeps,
  actorUserId: string,
  action: string,
  targetType: Target,
  targetId: string,
  reason?: string,
  meta?: Record<string, unknown>,
) {
  await deps.db.insert(modActions).values({
    actorUserId,
    action,
    targetType,
    targetId,
    reason: reason?.slice(0, 500),
    meta,
    createdAt: deps.now?.() ?? new Date(),
  });
}

const now = (deps: CoreDeps) => deps.now?.() ?? new Date();

// ---------- Reads ----------

export async function listOpenReports(deps: CoreDeps) {
  const rows = await deps.db
    .select({ report: reports, stream: streams, ticker: tokens.ticker })
    .from(reports)
    .innerJoin(streams, eq(streams.id, reports.streamId))
    .innerJoin(tokens, eq(tokens.id, streams.tokenId))
    .where(eq(reports.status, 'open'))
    .orderBy(desc(reports.createdAt))
    .limit(200);
  // Group by stream: moderators act on streams, and the reporter count matters more than each row.
  const byStream = new Map<
    string,
    {
      stream: (typeof rows)[number]['stream'];
      ticker: string | null;
      reports: (typeof rows)[number]['report'][];
    }
  >();
  for (const r of rows) {
    const entry = byStream.get(r.stream.id) ?? { stream: r.stream, ticker: r.ticker, reports: [] };
    entry.reports.push(r.report);
    byStream.set(r.stream.id, entry);
  }
  return [...byStream.values()].map((e) => ({
    streamId: e.stream.id,
    title: e.stream.title,
    ticker: e.ticker,
    status: e.stream.status,
    blurred: e.stream.blurred,
    snapshotUrl: e.reports.find((r) => r.snapshotUrl)?.snapshotUrl ?? e.stream.thumbnailUrl,
    reporters: new Set(e.reports.map((r) => r.reporterUserId)).size,
    categories: [...new Set(e.reports.map((r) => r.category))],
    reasons: e.reports.map((r) => r.reason).filter(Boolean),
    firstReportAt: e.reports.at(-1)!.createdAt,
    streamerUserId: e.stream.userId,
  }));
}

export async function listLiveStreams(deps: CoreDeps) {
  return deps.db
    .select({
      id: streams.id,
      title: streams.title,
      viewers: streams.currentViewers,
      startedAt: streams.startedAt,
      blurred: streams.blurred,
      thumbnailUrl: streams.thumbnailUrl,
      userId: streams.userId,
      address: wallets.address,
      ticker: tokens.ticker,
      chain: tokens.chain,
      contract: tokens.contract,
    })
    .from(streams)
    .innerJoin(wallets, eq(wallets.id, streams.walletId))
    .innerJoin(tokens, eq(tokens.id, streams.tokenId))
    .where(inArray(streams.status, ['starting', 'live']))
    .orderBy(desc(streams.currentViewers));
}

export async function listModActions(deps: CoreDeps, limit = 100) {
  return deps.db
    .select({ action: modActions, actorName: users.displayName })
    .from(modActions)
    .innerJoin(users, eq(users.id, modActions.actorUserId))
    .orderBy(desc(modActions.id))
    .limit(limit);
}

// ---------- Actions ----------

async function closeReports(
  deps: CoreDeps,
  actor: string,
  streamId: string,
  status: 'actioned' | 'dismissed',
) {
  await deps.db
    .update(reports)
    .set({ status, handledBy: actor, handledAt: now(deps) })
    .where(and(eq(reports.streamId, streamId), eq(reports.status, 'open')));
}

export async function killStream(deps: CoreDeps, actor: string, streamId: string, reason: string) {
  const stream = await getStream(deps, streamId);
  await terminateStream(deps, stream, 'killed', 'admin_kill');
  await closeReports(deps, actor, streamId, 'actioned');
  await log(deps, actor, 'kill_stream', 'stream', streamId, reason);
  return { streamId, status: 'killed' as const };
}

export async function setBlur(deps: CoreDeps, actor: string, streamId: string, on: boolean, reason?: string) {
  const stream = await getStream(deps, streamId);
  await deps.db.update(streams).set({ blurred: on }).where(eq(streams.id, streamId));
  await deps.streaming.sendData(stream.livekitRoom, 'system', { type: 'blur', on }).catch(() => undefined);
  if (!on) await closeReports(deps, actor, streamId, 'dismissed');
  await log(deps, actor, on ? 'blur' : 'unblur', 'stream', streamId, reason);
  return { streamId, blurred: on };
}

/** Dismiss = reports were unfounded: close them and lift an auto-blur. */
export async function dismissReports(deps: CoreDeps, actor: string, streamId: string, reason?: string) {
  const stream = await getStream(deps, streamId);
  await closeReports(deps, actor, streamId, 'dismissed');
  if (stream.blurred) {
    await deps.db.update(streams).set({ blurred: false }).where(eq(streams.id, streamId));
    await deps.streaming
      .sendData(stream.livekitRoom, 'system', { type: 'blur', on: false })
      .catch(() => undefined);
  }
  await log(deps, actor, 'dismiss_report', 'stream', streamId, reason);
  return { streamId, dismissed: true };
}

async function userByWallet(deps: CoreDeps, address: string) {
  const candidates = [address, address.toLowerCase()];
  const [row] = await deps.db
    .select({ user: users })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(inArray(wallets.address, candidates));
  if (!row) throw new ApiError(404, 'WALLET_NOT_FOUND', 'No APECAM user has this wallet');
  return row.user;
}

/**
 * Bans the *user* behind a wallet (all their linked wallets, embedded included):
 * sets banned_until, ends every live stream of theirs and invalidates all existing sessions.
 */
export async function banWallet(
  deps: CoreDeps,
  actor: string,
  address: string,
  until: Date | 'permanent',
  reason: string,
) {
  const user = await userByWallet(deps, address);
  if (user.role !== 'user')
    throw new ApiError(403, 'CANNOT_BAN_STAFF', 'Moderators and admins cannot be banned here');
  const bannedUntil = until === 'permanent' ? new Date('9999-12-31T00:00:00Z') : until;
  await deps.db.update(users).set({ bannedUntil }).where(eq(users.id, user.id));
  await deps.kv.set(kvKeys.sessionsValidAfter(user.id), String(now(deps).getTime()), 30 * 24 * 3600);

  const live = await deps.db
    .select()
    .from(streams)
    .where(and(eq(streams.userId, user.id), inArray(streams.status, ['starting', 'live'])));
  for (const s of live) {
    await terminateStream(deps, s, 'killed', 'admin_kill');
    await closeReports(deps, actor, s.id, 'actioned');
  }
  await log(deps, actor, 'ban_wallet', 'user', user.id, reason, {
    address,
    until: bannedUntil.toISOString(),
    streamsEnded: live.length,
  });
  await alertOnMassBans(deps, actor);
  return { userId: user.id, bannedUntil, streamsEnded: live.length };
}

/** A hijacked moderator account banning many wallets is the damage case (§12): alert once per hour. */
export const MASS_BAN_THRESHOLD = 5;

async function alertOnMassBans(deps: CoreDeps, actor: string) {
  const since = new Date(now(deps).getTime() - 3600_000);
  const [row] = (await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(modActions)
    .where(
      and(
        eq(modActions.actorUserId, actor),
        eq(modActions.action, 'ban_wallet'),
        sql`${modActions.createdAt} >= ${since}`,
      ),
    )) as [{ n: number }];
  if (row.n < MASS_BAN_THRESHOLD) return;
  const key = `alert:mass-ban:${actor}`;
  if (await deps.kv.get(key)) return;
  await deps.kv.set(key, '1', 3600);
  const [who] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, actor));
  await deps.notifier
    ?.send(`🚨 ${who?.name ?? actor} banned ${row.n} wallets in the last hour. Check Admin → Action log.`)
    .catch(() => undefined);
}

export async function unbanWallet(deps: CoreDeps, actor: string, address: string, reason?: string) {
  const user = await userByWallet(deps, address);
  await deps.db.update(users).set({ bannedUntil: null }).where(eq(users.id, user.id));
  await log(deps, actor, 'unban', 'user', user.id, reason, { address });
  return { userId: user.id, bannedUntil: null };
}

export async function setTokenHidden(
  deps: CoreDeps,
  actor: string,
  chain: ChainId,
  contract: string,
  hidden: boolean,
  reason?: string,
) {
  const normalized = normalizeAddress(CHAINS[chain].family, contract);
  const [token] = await deps.db
    .update(tokens)
    .set({ hidden })
    .where(and(eq(tokens.chain, chain), eq(tokens.contract, normalized)))
    .returning();
  if (!token) throw new ApiError(404, 'TOKEN_NOT_FOUND', 'Token not known to APECAM');
  if (hidden) {
    // A hidden token has no stage: end its live streams too.
    const live = await deps.db
      .select()
      .from(streams)
      .where(and(eq(streams.tokenId, token.id), inArray(streams.status, ['starting', 'live'])));
    for (const s of live) await terminateStream(deps, s, 'killed', 'admin_kill');
  }
  await log(deps, actor, hidden ? 'hide_token' : 'unhide_token', 'token', token.id, reason, {
    chain,
    contract: normalized,
  });
  return { chain, contract: normalized, hidden };
}

export async function deleteChatMessage(deps: CoreDeps, actor: string, messageId: number, reason?: string) {
  const [msg] = await deps.db
    .update(chatMessages)
    .set({ deletedAt: now(deps) })
    .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
    .returning();
  if (!msg) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Message not found or already deleted');
  const stream = await getStream(deps, msg.streamId);
  await deps.streaming
    .sendData(stream.livekitRoom, 'chat', { type: 'chat_delete', id: messageId })
    .catch(() => undefined);
  await log(deps, actor, 'delete_chat', 'chat', String(messageId), reason, { streamId: msg.streamId });
  return { id: messageId, deleted: true };
}

export async function countOpenReports(deps: CoreDeps) {
  const [row] = await deps.db
    .select({ n: sql<number>`count(distinct ${reports.streamId})::int` })
    .from(reports)
    .where(eq(reports.status, 'open'));
  return row?.n ?? 0;
}

// ---------- Go Live access (Sprint 5: closed beta + emergency button) ----------

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Normalised invite key, or null when it is not a wallet address. */
export function inviteAddress(raw: string): string | null {
  const a = raw.trim();
  if (EVM_ADDRESS.test(a)) return a.toLowerCase();
  if (SOLANA_ADDRESS.test(a)) return a;
  return null;
}

/**
 * Sets who may go live. Closing can also end every live stream at once (the emergency path). Takes effect
 * immediately: the start API reads the mode uncached.
 */
export async function setGoLiveAccess(
  deps: CoreDeps,
  actor: string,
  mode: GoLiveAccess,
  opts: { reason: string; endLive?: boolean },
) {
  const before = await readGoLiveAccess(deps);
  await deps.db
    .insert(appConfig)
    .values({ key: 'go_live.access', value: mode, updatedBy: actor, updatedAt: now(deps) })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: mode, updatedBy: actor, updatedAt: now(deps) },
    });

  let streamsEnded = 0;
  if (mode === 'closed' && opts.endLive) {
    const live = await deps.db
      .select()
      .from(streams)
      .where(inArray(streams.status, ['starting', 'live']));
    for (const s of live) {
      await terminateStream(deps, s, 'killed', 'admin_kill');
      streamsEnded++;
    }
  }
  await log(deps, actor, 'set_go_live_access', 'config', 'go_live.access', opts.reason, {
    before,
    after: mode,
    streamsEnded,
  });
  if (before !== mode) {
    const [who] = await deps.db.select({ name: users.displayName }).from(users).where(eq(users.id, actor));
    const ended = streamsEnded ? `, ${streamsEnded} live streams ended` : '';
    await deps.notifier
      ?.send(
        `🔒 Go Live is now "${mode}" (was "${before}")${ended}. By ${who?.name ?? actor}: ${opts.reason}`,
      )
      .catch(() => undefined);
  }
  return { mode, before, streamsEnded };
}

/** Adds invites (idempotent). Returns what was added and what was rejected as not an address. */
export async function inviteWallets(deps: CoreDeps, actor: string, rawAddresses: string[], note?: string) {
  const invalid: string[] = [];
  const addresses = new Set<string>();
  for (const raw of rawAddresses) {
    if (!raw.trim()) continue;
    const a = inviteAddress(raw);
    if (a) addresses.add(a);
    else invalid.push(raw.trim());
  }
  if (addresses.size) {
    await deps.db
      .insert(goLiveInvites)
      .values([...addresses].map((address) => ({ address, note, invitedBy: actor, createdAt: now(deps) })))
      .onConflictDoNothing();
    await log(deps, actor, 'invite_go_live', 'wallet', [...addresses].join(',').slice(0, 200), note, {
      count: addresses.size,
    });
  }
  return { invited: [...addresses], invalid };
}

export async function revokeInvite(deps: CoreDeps, actor: string, raw: string) {
  const address = inviteAddress(raw);
  if (!address) throw new ApiError(400, 'INVALID_ADDRESS', 'Not a wallet address');
  const removed = await deps.db.delete(goLiveInvites).where(eq(goLiveInvites.address, address)).returning();
  if (!removed.length) throw new ApiError(404, 'INVITE_NOT_FOUND', 'This wallet is not invited');
  await log(deps, actor, 'revoke_go_live_invite', 'wallet', address);
  return { address };
}

/** Invite list with whether the wallet has signed in yet (useful for chasing beta testers). */
export async function listInvites(deps: CoreDeps) {
  const rows = await deps.db
    .select({
      address: goLiveInvites.address,
      note: goLiveInvites.note,
      createdAt: goLiveInvites.createdAt,
      userId: wallets.userId,
    })
    .from(goLiveInvites)
    .leftJoin(wallets, eq(wallets.address, goLiveInvites.address))
    .orderBy(desc(goLiveInvites.createdAt));
  return rows.map((r) => ({ ...r, signedUp: r.userId !== null }));
}
