import { appConfig, modActions } from '@apecam/db';
import {
  APP_CONFIG_DEFAULTS,
  ApiError,
  GO_LIVE_ACCESS,
  type AppConfig,
  type AppConfigKey,
  type GoLiveAccess,
} from '@apecam/shared';
import type { CoreDeps } from './deps';

/** Admin config screen (S3-10): every key with its current value and default. */
export async function readSettings(deps: CoreDeps) {
  const current = await deps.config();
  return (Object.keys(APP_CONFIG_DEFAULTS) as AppConfigKey[]).map((key) => ({
    key,
    value: current[key],
    defaultValue: APP_CONFIG_DEFAULTS[key],
  }));
}

/** Keys whose valid values are narrower than "same type as the default". */
const VALIDATORS: Partial<Record<AppConfigKey, (v: unknown) => boolean>> = {
  'go_live.access': (v) => GO_LIVE_ACCESS.includes(v as GoLiveAccess),
  // Rendered as a link: https only (no javascript: URLs), empty string hides it.
  'beta.feedback_url': (v) =>
    v === '' || (typeof v === 'string' && v.length <= 300 && /^https:\/\/[^\s]+$/.test(v)),
};

function valid(key: AppConfigKey, value: unknown) {
  const check = VALIDATORS[key];
  return check ? check(value) : sameShape(value, APP_CONFIG_DEFAULTS[key]);
}

function sameShape(value: unknown, def: unknown): boolean {
  if (typeof def === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (typeof def === 'string') return typeof value === 'string' && value.length > 0 && value.length < 100;
  if (Array.isArray(def)) {
    // s2e.tiers: [[minutes, total], …] with positive integers.
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((t) => Array.isArray(t) && t.length === 2 && t.every((n) => Number.isInteger(n) && n > 0))
    );
  }
  return false;
}

/**
 * Changes a runtime setting without a deploy (e.g. tiers, D20 bonding-curve thresholds). Values must have the
 * same shape as the default; the change is logged. The per-process config cache picks it up within a minute.
 */
export async function updateSetting(deps: CoreDeps, actorUserId: string, key: string, value: unknown) {
  if (!(key in APP_CONFIG_DEFAULTS)) throw new ApiError(400, 'UNKNOWN_SETTING', `Unknown setting ${key}`);
  const k = key as AppConfigKey;
  if (!valid(k, value)) throw new ApiError(400, 'INVALID_SETTING', `Invalid value for ${key}`);
  const before = (await deps.config())[k];
  const now = deps.now?.() ?? new Date();
  await deps.db
    .insert(appConfig)
    .values({ key, value: value as never, updatedBy: actorUserId, updatedAt: now })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: value as never, updatedBy: actorUserId, updatedAt: now },
    });
  await deps.db.insert(modActions).values({
    actorUserId,
    action: 'update_config',
    targetType: 'config',
    targetId: key,
    meta: { before, after: value },
    createdAt: now,
  });
  return { key, value: value as AppConfig[typeof k] };
}
