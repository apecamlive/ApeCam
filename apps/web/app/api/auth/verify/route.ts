import { ApiError } from '@apecam/shared';
import { z } from 'zod';
import { newSession, signInWallet, verifySignIn } from '@/lib/server/auth';
import { parseBody, LIMITS, route } from '@/lib/server/http';
import { createSessionToken, sessionCookie } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  family: z.enum(['evm', 'solana']),
  message: z.string().min(1).max(2000),
  signature: z.string().min(1).max(500),
});

/** Step 2 of sign-in: verify the plain-text signature, find or create the user, set the session cookie. */
export const POST = route(
  async (req, _ctx, deps) => {
    const body = await parseBody(req, Body);
    const now = deps.now?.() ?? new Date();
    const signer = await verifySignIn(deps.kv, deps.auth, body, now);
    const { user, wallet } = await signInWallet(deps.db, signer, now);
    if (user.bannedUntil && user.bannedUntil > now) {
      throw new ApiError(403, 'USER_BANNED', 'This account is banned', {
        until: user.bannedUntil.toISOString(),
      });
    }
    const token = await createSessionToken(deps.keys, newSession(user), deps.now?.() ?? new Date());
    return Response.json(
      {
        user: { id: user.id, role: user.role, displayName: user.displayName },
        wallet: { id: wallet.id, family: wallet.chainFamily, address: wallet.address },
      },
      { headers: { 'set-cookie': sessionCookie(token, deps.secureCookies) } },
    );
  },
  { rateLimit: LIMITS.auth },
);
