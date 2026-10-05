import { randomUUID } from 'node:crypto';
import type { ChainId } from '@apecam/chain';
import { holdingChecks, streams, users } from '@apecam/db';
import { ApiError } from '@apecam/shared';
import { eq } from 'drizzle-orm';
import { assertCanGoLive } from './access';
import type { CoreDeps } from './deps';
import { checkEligibility } from './eligibility';
import type { StreamSource } from './streaming';

export type StreamRow = typeof streams.$inferSelect;

/** LiveKit identities. The streamer publishes as `pub_…`; viewers are `u_…` (signed in) or `a_…` (anonymous). */
export const identity = {
  publisher: (userId: string) => `pub_${userId}`,
  viewer: (userId: string) => `u_${userId}`,
  anonymous: () => `a_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
  userIdOf: (id: string) => (id.startsWith('pub_') ? id.slice(4) : id.startsWith('u_') ? id.slice(2) : null),
};

export const roomName = (streamId: string) => `s_${streamId}`;
export const streamIdFromRoom = (room: string) => (room.startsWith('s_') ? room.slice(2) : null);

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export interface StartStreamInput {
  userId: string;
  walletId: string;
  chain: ChainId;
  contract: string;
  title: string;
  source: StreamSource;
  rulesAccepted: boolean;
  /** 18+ confirmation (S4-11). */
  ageConfirmed: boolean;
}

export async function startStream(deps: CoreDeps, input: StartStreamInput) {
  if (!input.rulesAccepted)
    throw new ApiError(400, 'RULES_NOT_ACCEPTED', 'Accept the content rules to go live');
  if (!input.ageConfirmed) throw new ApiError(400, 'AGE_NOT_CONFIRMED', 'You must be 18 or older to go live');
  await assertCanGoLive(deps, input.userId);

  // Never trust an earlier eligibility response from the client: check again right before going live.
  const check = await checkEligibility(deps, input);
  if (!check.result.passed) {
    throw new ApiError(403, 'NOT_ELIGIBLE', 'Wallet is not eligible to go live for this token', {
      ...check.result,
    });
  }

  const streamId = randomUUID();
  const room = roomName(streamId);
  try {
    await deps.db.insert(streams).values({
      id: streamId,
      tokenId: check.token.id,
      userId: input.userId,
      walletId: input.walletId,
      title: input.title,
      source: input.source,
      status: 'starting',
      livekitRoom: room,
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new ApiError(409, 'WALLET_ALREADY_LIVE', 'This wallet already has a live stream');
    throw err;
  }

  if (check.holding !== 'rpc_error' && check.quote) {
    await deps.db.insert(holdingChecks).values({
      streamId,
      walletId: input.walletId,
      tokenId: check.token.id,
      rawBalance: check.holding.rawBalance.toString(),
      priceUsd: check.quote.priceUsd,
      usdValue: check.result.usdValue ?? '0',
      passed: true,
      checkedAt: deps.now?.() ?? new Date(),
    });
  }

  try {
    await deps.streaming.createRoom(room);
  } catch (err) {
    await deps.db
      .update(streams)
      .set({ status: 'ended', endReason: 'error', endedAt: deps.now?.() ?? new Date() })
      .where(eq(streams.id, streamId));
    deps.log?.error({ err: String(err), streamId }, 'createRoom failed');
    throw new ApiError(503, 'STREAMING_UNAVAILABLE', 'Streaming service unavailable, try again');
  }

  const [user] = await deps.db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, input.userId));
  const token = await deps.streaming.publisherToken(
    room,
    identity.publisher(input.userId),
    user?.displayName ?? '',
  );
  return { streamId, room, token, wsUrl: deps.streaming.wsUrl, eligibility: check.result };
}

type EndStatus = 'ended' | 'cut' | 'killed';
type EndReason = NonNullable<StreamRow['endReason']>;

/** Ends a stream on the server side. LiveKit tokens do not expire mid-session, so the room must be closed. */
export async function terminateStream(
  deps: CoreDeps,
  stream: StreamRow,
  status: EndStatus,
  reason: EndReason,
) {
  if (stream.status !== 'starting' && stream.status !== 'live') return;
  const now = deps.now?.() ?? new Date();
  await deps.db
    .update(streams)
    .set({ status, endReason: reason, endedAt: now, currentViewers: 0, warningUntil: null })
    .where(eq(streams.id, stream.id));
  if (stream.egressId) await deps.streaming.stopEgress(stream.egressId);
  await deps.streaming.removeParticipant(stream.livekitRoom, identity.publisher(stream.userId));
  await deps.streaming.deleteRoom(stream.livekitRoom);
  deps.log?.info({ streamId: stream.id, status, reason }, 'stream terminated');
}

export async function getStream(deps: Pick<CoreDeps, 'db'>, streamId: string) {
  const [stream] = await deps.db.select().from(streams).where(eq(streams.id, streamId));
  if (!stream) throw new ApiError(404, 'STREAM_NOT_FOUND', 'Stream not found');
  return stream;
}

export async function endStream(deps: CoreDeps, args: { userId: string; streamId: string }) {
  const stream = await getStream(deps, args.streamId);
  if (stream.userId !== args.userId)
    throw new ApiError(403, 'FORBIDDEN', 'Only the streamer can end this stream');
  await terminateStream(deps, stream, 'ended', 'user_end');
  return { streamId: stream.id, status: 'ended' as const };
}

export async function viewerToken(deps: CoreDeps, args: { streamId: string; userId?: string }) {
  const stream = await getStream(deps, args.streamId);
  if (stream.status !== 'starting' && stream.status !== 'live') {
    throw new ApiError(410, 'STREAM_ENDED', 'This stream has ended');
  }
  const id = args.userId ? identity.viewer(args.userId) : identity.anonymous();
  const token = await deps.streaming.viewerToken(stream.livekitRoom, id);
  return {
    token,
    wsUrl: deps.streaming.wsUrl,
    room: stream.livekitRoom,
    identity: id,
    blurred: stream.blurred,
  };
}
