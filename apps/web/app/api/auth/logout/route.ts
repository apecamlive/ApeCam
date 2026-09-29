import { getSession, route } from '@/lib/server/http';
import { clearSessionCookie, revokeSession } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = route(async (req, _ctx, deps) => {
  const session = await getSession(req, deps);
  if (session) await revokeSession(deps.kv, session.sid);
  return Response.json({ ok: true }, { headers: { 'set-cookie': clearSessionCookie(deps.secureCookies) } });
});
