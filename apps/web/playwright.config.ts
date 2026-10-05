import { defineConfig, devices } from '@playwright/test';
import { ADMIN_ADDRESS, E2E_ORIGIN, E2E_PORT } from './e2e/fixtures';

const DB_PORT = 54330;

/**
 * E2E against the production build (`next build` first) and a throwaway seeded database.
 *   pnpm --filter @apecam/web build && pnpm --filter @apecam/web e2e
 * No LiveKit / chains / Redis: flows that need live video are covered up to that point (see e2e/README.md).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one PGlite connection at a time; tests share the seeded data
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: E2E_ORIGIN, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter @apecam/db e2e:db',
      port: DB_PORT,
      env: { E2E_DB_PORT: String(DB_PORT), E2E_ADMIN_ADDRESS: ADMIN_ADDRESS },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next start -p ${E2E_PORT}`,
      // /api/health is 503 here on purpose (no Redis), so wait for any page instead.
      url: `${E2E_ORIGIN}/robots.txt`,
      stdout: 'pipe',
      env: {
        DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
        APP_ORIGIN: E2E_ORIGIN,
        REDIS_URL: '',
        LIVEKIT_URL: '',
        CF_ORIGIN_SECRET: '',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
