import { trackerSummary } from '@apecam/core';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** `/burn` headline numbers, all from chain data (§9). Cached 60s. */
export const GET = route(async (_req, _ctx, deps) => trackerSummary(deps));
