import { listModActions } from '@apecam/core';
import { requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps);
  const rows = await listModActions(deps);
  return { actions: rows.map((r) => ({ ...r.action, actorName: r.actorName })) };
});
