import { recentChat, sendChatMessage } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireSession, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Last 50 messages, oldest first. Public: anyone watching can read chat. */
export const GET = route(async (_req, ctx, deps) => {
  const streamId = z.uuid().parse((await ctx.params).id);
  return { messages: await recentChat(deps, streamId) };
});

/** Only connected, signed-in wallets can chat (Dev Brief). */
export const POST = route(async (req, ctx, deps) => {
  const session = await requireSession(req, deps);
  const streamId = z.uuid().parse((await ctx.params).id);
  const { body } = await parseBody(req, z.object({ body: z.string().max(1000) }));
  return { message: await sendChatMessage(deps, { userId: session.userId, streamId, body }) };
});
