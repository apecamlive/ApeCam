import { systemHealth } from '@apecam/core';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Admin Health tab (S4-9): worker jobs, tracker lag, live streams. */
export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps, 'admin');
  return systemHealth(deps);
});
