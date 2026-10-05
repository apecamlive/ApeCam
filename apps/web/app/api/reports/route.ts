import { createReport } from '@apecam/core';
import { REPORT_CATEGORIES } from '@apecam/db';
import { z } from 'zod';
import { parseBody, requireSession, LIMITS, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  streamId: z.uuid(),
  category: z.enum(REPORT_CATEGORIES),
  reason: z.string().trim().max(500).optional(),
});

/** Report a stream (S2-3). Signed-in wallets only; one report per user per stream. */
export const POST = route(
  async (req, _ctx, deps) => {
    const session = await requireSession(req, deps);
    const body = await parseBody(req, Body);
    return createReport(deps, { userId: session.userId, ...body });
  },
  { rateLimit: LIMITS.reports },
);
