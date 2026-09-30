import { registerEmbeddedWallet } from '@apecam/core';
import { requireSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/**
 * Called after the browser created the Privy embedded wallet (D7). The body is ignored on purpose:
 * the address is fetched from Privy's server API so a client cannot choose where payouts go.
 */
export const POST = route(
  async (req, _ctx, deps) => {
    const session = await requireSession(req, deps);
    return registerEmbeddedWallet(deps, session.userId);
  },
  { rateLimit: LIMITS.embedded },
);
