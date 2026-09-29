import { createNonce } from '@/lib/server/auth';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Step 1 of sign-in: a single-use nonce (5 min) plus the fields the wallet message must contain. */
export const POST = route(async (_req, _ctx, deps) => {
  const nonce = await createNonce(deps.kv, deps.now?.() ?? new Date());
  return { ...nonce, domain: deps.auth.domain, uri: deps.auth.origin };
});
