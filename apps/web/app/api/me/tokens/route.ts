import { listWalletTokens } from '@apecam/core';
import { z } from 'zod';
import { requireSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Tokens held by one of the user's wallets, most valuable first (Studio token picker, S2-1). */
export const GET = route(
  async (req, _ctx, deps) => {
    const session = await requireSession(req, deps);
    const walletId = z.uuid().parse(new URL(req.url).searchParams.get('walletId'));
    return listWalletTokens(deps, { userId: session.userId, walletId });
  },
  { rateLimit: LIMITS.myTokens },
);
