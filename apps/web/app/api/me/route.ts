import { goLiveAccessFor, liveStreamsByWallet, updateDisplayName } from '@apecam/core';
import { users, wallets } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getSession, parseBody, requireSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Current user and linked wallets; `{ user: null }` when signed out (not an error). */
export const GET = route(async (req, _ctx, deps) => {
  const session = await getSession(req, deps);
  if (!session) return { user: null, wallets: [] };
  const [user] = await deps.db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return { user: null, wallets: [] };
  const ws = await deps.db
    .select({
      id: wallets.id,
      family: wallets.chainFamily,
      address: wallets.address,
      isPayout: wallets.isPayout,
      source: wallets.source,
    })
    .from(wallets)
    .where(eq(wallets.userId, user.id));
  const live = await liveStreamsByWallet(deps, user.id);
  const access = await goLiveAccessFor(deps, user.id);
  return {
    user: {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bannedUntil: user.bannedUntil,
    },
    wallets: ws.map((w) => ({ ...w, liveStreamId: live.get(w.id) ?? null })),
    // Studio shows this before the steps, so a beta-closed user is not led through a flow that will fail.
    goLive: access.allowed
      ? { mode: access.mode, allowed: true }
      : { mode: access.mode, allowed: false, code: access.code, message: access.message },
  };
});

/** Profile edit (S2-6): display name. Avatars go through POST /api/me/avatar. */
export const PATCH = route(
  async (req, _ctx, deps) => {
    const session = await requireSession(req, deps);
    const body = await parseBody(req, z.object({ displayName: z.string().max(64).nullable() }));
    return updateDisplayName(deps, session.userId, body.displayName);
  },
  { rateLimit: LIMITS.profile },
);
