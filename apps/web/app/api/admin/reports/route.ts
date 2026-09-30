import { listOpenReports } from '@apecam/core';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Report queue grouped per stream (S2-4). */
export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps);
  return { streams: await listOpenReports(deps) };
});
