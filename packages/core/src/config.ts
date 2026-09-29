import { appConfig, type Db } from '@apecam/db';
import { APP_CONFIG_DEFAULTS, type AppConfig } from '@apecam/shared';

/**
 * `app_config` rows merged over the defaults, cached per process so every request does not
 * hit the database. Admin changes propagate within `ttlMs`.
 */
export function createConfigLoader(db: Db, ttlMs = 60_000, now = Date.now) {
  let cached: { value: AppConfig; at: number } | undefined;
  return async function loadConfig(): Promise<AppConfig> {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    const rows = await db.select({ key: appConfig.key, value: appConfig.value }).from(appConfig);
    const merged = { ...APP_CONFIG_DEFAULTS } as Record<string, unknown>;
    for (const row of rows) if (row.key in merged) merged[row.key] = row.value;
    cached = { value: merged as AppConfig, at: now() };
    return cached.value;
  };
}
