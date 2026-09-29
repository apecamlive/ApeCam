import { chatMessages, streams, users, wallets } from '@apecam/db';
import { ApiError, shortAddress } from '@apecam/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { CoreDeps } from './deps';
import { getStream } from './streams';

const LINK = /(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|io|xyz|net|org|gg|app|fun|me|co|link|ly|to|sh)\b/i;

/** Chat rules checked before anything is stored or broadcast (S1-10). */
export function validateChatBody(raw: string, maxLen: number): string {
  const body = raw.replace(/\s+/g, ' ').trim();
  if (!body) throw new ApiError(400, 'CHAT_EMPTY', 'Message is empty');
  if (body.length > maxLen) throw new ApiError(400, 'CHAT_TOO_LONG', `Max ${maxLen} characters`);
  if (LINK.test(body)) throw new ApiError(400, 'CHAT_LINK', 'Links are not allowed in chat');
  return body;
}

export interface ChatMessageView {
  id: number;
  userId: string;
  name: string;
  body: string;
  at: string;
}

async function senderName(deps: Pick<CoreDeps, 'db'>, userId: string) {
  const [row] = await deps.db
    .select({ displayName: users.displayName, address: wallets.address })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row?.displayName ?? (row?.address ? shortAddress(row.address) : 'anon');
}

/**
 * Server-relayed chat (Implementation Plan §4.7): validate, rate-limit, store, then broadcast over the
 * LiveKit data channel. Viewers have no publish-data permission, so nothing bypasses this path.
 */
export async function sendChatMessage(
  deps: CoreDeps,
  args: { userId: string; streamId: string; body: string },
) {
  const config = await deps.config();
  const stream = await getStream(deps, args.streamId);
  if (stream.status !== 'live' && stream.status !== 'starting')
    throw new ApiError(410, 'STREAM_ENDED', 'This stream has ended');
  const body = validateChatBody(args.body, config['chat.max_len']);

  const rlKey = `chat-rl:${args.userId}`;
  if (await deps.kv.get(rlKey))
    throw new ApiError(429, 'CHAT_RATE_LIMIT', 'Slow down: one message every 2 seconds');
  await deps.kv.set(rlKey, '1', Math.ceil(config['chat.min_interval_ms'] / 1000));

  const now = deps.now?.() ?? new Date();
  const [row] = await deps.db
    .insert(chatMessages)
    .values({ streamId: stream.id, userId: args.userId, body, createdAt: now })
    .returning();
  const message: ChatMessageView = {
    id: row!.id,
    userId: args.userId,
    name: await senderName(deps, args.userId),
    body,
    at: now.toISOString(),
  };
  await deps.streaming.sendData(stream.livekitRoom, 'chat', { type: 'chat', message }).catch((err) => {
    deps.log?.warn({ err: String(err), streamId: stream.id }, 'chat broadcast failed');
  });
  return message;
}

export async function recentChat(
  deps: Pick<CoreDeps, 'db'>,
  streamId: string,
  limit = 50,
): Promise<ChatMessageView[]> {
  const rows = await deps.db
    .select({
      id: chatMessages.id,
      userId: chatMessages.userId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      displayName: users.displayName,
    })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.userId))
    .innerJoin(streams, eq(streams.id, chatMessages.streamId))
    .where(and(eq(chatMessages.streamId, streamId), isNull(chatMessages.deletedAt)))
    .orderBy(desc(chatMessages.id))
    .limit(limit);
  const names = new Map<string, string>();
  for (const r of rows)
    if (!names.has(r.userId)) names.set(r.userId, r.displayName ?? (await senderName(deps, r.userId)));
  return rows.reverse().map((r) => ({
    id: r.id,
    userId: r.userId,
    name: names.get(r.userId)!,
    body: r.body,
    at: r.createdAt.toISOString(),
  }));
}
