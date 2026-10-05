import { inviteWallets } from '@apecam/core';
import { z } from 'zod';
import { parseBody, requireStaff, route } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  addresses: z.array(z.string().max(100)).min(1).max(200),
  note: z.string().trim().max(200).optional(),
});

/** Invite wallets to the closed beta (one per line in the admin UI). Invalid lines are returned, not fatal. */
export const POST = route(async (req, _ctx, deps) => {
  const staff = await requireStaff(req, deps);
  const body = await parseBody(req, Body);
  return inviteWallets(deps, staff.userId, body.addresses, body.note || undefined);
});
