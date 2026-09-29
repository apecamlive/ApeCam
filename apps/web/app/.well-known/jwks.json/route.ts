import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Public key for session JWTs; Privy custom auth verifies APECAM users with it (ADR 006). */
export const GET = route(async (_req, _ctx, deps) => ({ keys: [deps.keys.publicJwk] }));
