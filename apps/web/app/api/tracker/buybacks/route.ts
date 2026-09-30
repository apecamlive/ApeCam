import { listBuybacks } from '@apecam/core';
import { z } from 'zod';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, _ctx, deps) => {
  const cursor = z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .parse(new URL(req.url).searchParams.get('cursor') ?? undefined);
  return listBuybacks(deps, cursor);
});
