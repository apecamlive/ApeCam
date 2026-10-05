import { appConfig, goLiveInvites, users, wallets } from '@apecam/db';
import { APP_CONFIG_DEFAULTS, ApiError, GO_LIVE_ACCESS, type GoLiveAccess } from '@apecam/shared';
import { eq } from 'drizzle-orm';
import type { CoreDeps } from './deps';

/**
 * Who may go live (Sprint 5, launch checklist "tombol darurat", risk R4):
 * - `open`: every eligible wallet;
 * - `invite`: closed beta, only invited users and staff;
 * - `closed`: nobody (emergency button). Existing streams are not touched unless the moderator asks.
 *
 * Read straight from the database, not the 60-second config cache: closing must take effect immediately.
 */
export async function readGoLiveAccess(deps: Pick<CoreDeps, 'db'>): Promise<GoLiveAccess> {
  const [row] = await deps.db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, 'go_live.access'));
  const v = row?.value as GoLiveAccess | undefined;
  return v && GO_LIVE_ACCESS.includes(v) ? v : APP_CONFIG_DEFAULTS['go_live.access'];
}

export type GoLiveAccessResult =
  | { mode: GoLiveAccess; allowed: true }
  | { mode: GoLiveAccess; allowed: false; code: 'GO_LIVE_CLOSED' | 'GO_LIVE_INVITE_ONLY'; message: string };

export async function goLiveAccessFor(
  deps: Pick<CoreDeps, 'db'>,
  userId: string,
): Promise<GoLiveAccessResult> {
  const mode = await readGoLiveAccess(deps);
  if (mode === 'open') return { mode, allowed: true };
  if (mode === 'closed') {
    return {
      mode,
      allowed: false,
      code: 'GO_LIVE_CLOSED',
      message: 'Go Live is paused for everyone right now. Watching and chat still work.',
    };
  }
  const [user] = await deps.db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (user && user.role !== 'user') return { mode, allowed: true };
  // Invited if any wallet linked to this user is on the list (invites are per address).
  const [invite] = await deps.db
    .select({ address: goLiveInvites.address })
    .from(goLiveInvites)
    .innerJoin(wallets, eq(wallets.address, goLiveInvites.address))
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (invite) return { mode, allowed: true };
  return {
    mode,
    allowed: false,
    code: 'GO_LIVE_INVITE_ONLY',
    message: 'APECAM is in closed beta: Go Live is open to invited streamers only.',
  };
}

export async function assertCanGoLive(deps: Pick<CoreDeps, 'db'>, userId: string) {
  const access = await goLiveAccessFor(deps, userId);
  if (!access.allowed) throw new ApiError(403, access.code, access.message, { mode: access.mode });
}
