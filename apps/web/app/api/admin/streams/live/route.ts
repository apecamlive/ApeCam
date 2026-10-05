import { listLiveStreams } from '@apecam/core';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps);
  return { streams: await listLiveStreams(deps) };
});
