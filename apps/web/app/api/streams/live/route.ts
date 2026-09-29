import { getFeed } from '@apecam/core';
import { z } from 'zod';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Query = z.object({
  tab: z.enum(['live', 'trending', 'new']).default('live'),
  cursor: z.coerce.number().int().min(0).default(0),
});

/** Home feed: Live Now (most viewers), Trending (15-minute growth), Just Live (newest). */
export const GET = route(async (req, _ctx, deps) => {
  const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return getFeed(deps, q.tab, q.cursor);
});
