import { CHAIN_IDS } from '@apecam/chain';
import { startStream } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  chain: z.enum(CHAIN_IDS),
  contract: z.string().min(20).max(64),
  walletId: z.uuid(),
  title: z.string().trim().min(3).max(80),
  source: z.enum(['camera', 'screen', 'screen_camera']),
  rulesAccepted: z.boolean(),
  ageConfirmed: z.boolean(),
});

export const POST = route(
  async (req, _ctx, deps) => {
    const session = await requireSession(req, deps);
    const body = await parseBody(req, Body);
    const res = await startStream(deps, { userId: session.userId, ...body });
    return { streamId: res.streamId, token: res.token, wsUrl: res.wsUrl, room: res.room };
  },
  { rateLimit: LIMITS.start },
);
