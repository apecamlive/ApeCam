import { handleLivekitEvent } from '@apecam/core';
import { ApiError } from '@apecam/shared';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** LiveKit → APECAM. Authenticated by LiveKit's signed Authorization header, not by Origin. */
export const POST = route(
  async (req, _ctx, deps) => {
    const body = await req.text();
    const event = await deps.streaming.receiveWebhook(body, req.headers.get('authorization')).catch(() => {
      throw new ApiError(401, 'BAD_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
    });
    return handleLivekitEvent(deps, event);
  },
  { skipOriginCheck: true },
);
