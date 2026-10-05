import { readSettings, updateSetting } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Runtime settings (tiers, thresholds, D20…). Admin only; every change goes to the action log. */
export const GET = route(async (req, _ctx, deps) => {
  await requireStaff(req, deps, 'admin');
  return { settings: await readSettings(deps) };
});

export const PATCH = route(async (req, _ctx, deps) => {
  const admin = await requireStaff(req, deps, 'admin');
  const body = await parseBody(req, z.object({ key: z.string().min(1).max(100), value: z.unknown() }));
  return updateSetting(deps, admin.userId, body.key, body.value);
});
