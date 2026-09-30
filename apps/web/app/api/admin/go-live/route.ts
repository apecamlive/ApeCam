import { listInvites, readGoLiveAccess, setGoLiveAccess } from '@apecam/core';
import { GO_LIVE_ACCESS } from '@apecam/shared';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Current Go Live access mode and the closed-beta invite list (moderators and admins). */
export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps);
  return { mode: await readGoLiveAccess(deps), invites: await listInvites(deps) };
});

const Body = z.object({
  mode: z.enum(GO_LIVE_ACCESS),
  reason: z.string().trim().min(1).max(500),
  /** Only with mode 'closed': also end every stream that is live right now. */
  endLive: z.boolean().optional(),
});

/**
 * Emergency button / beta switch. Moderators may use it too: whoever is on shift must be able to close Go
 * Live without waiting for an admin. Every change is in the action log and sent to the alert channel.
 */
export const POST = route(async (req, _ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const body = await parseBody(req, Body);
  return setGoLiveAccess(deps, staff.userId, body.mode, {
    reason: body.reason,
    endLive: body.mode === 'closed' && body.endLive,
  });
});
