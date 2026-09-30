import { trackerDaily } from '@apecam/core';
import { z } from 'zod';
import { route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, _ctx, deps) => {
  const days = z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(90)
    .parse(new URL(req.url).searchParams.get('days') ?? undefined);
  return { days: await trackerDaily(deps, days) };
});
