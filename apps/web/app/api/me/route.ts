import { users, wallets } from '@apecam/db';
import { eq } from 'drizzle-orm';
import { getSession, route } from '@/lib/server/http';

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
  return {
    user: {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bannedUntil: user.bannedUntil,
    },
    wallets: ws,
  };
});
