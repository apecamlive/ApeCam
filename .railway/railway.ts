/**
 * APECAM on Railway, as code (replaces the deprecated apps/web/railway.json + apps/worker/railway.json).
 *
 *   railway login && railway link            # pick the APECAM project + environment
 *   railway config plan                       # review: nothing you want to keep may show as "delete"
 *   railway config apply
 *
 * Both app services build from the REPOSITORY ROOT (empty rootDirectory): the monorepo needs pnpm-lock.yaml,
 * pnpm-workspace.yaml and packages/* to install with pnpm. Each service then builds and starts only its app.
 *
 * Secrets are never written here: `preserve()` keeps whatever value is set in the Railway dashboard.
 * Anything not declared in this file can be removed by `apply`, so keep every service you want listed here.
 */
import { defineRailway, github, postgres, preserve, redis, service } from 'railway/iac';

const REPO = 'apecamlive/ApeCam';
const BRANCH = 'main';

/** Variables both app services read (see .env.example); values live in the dashboard. */
const sharedSecrets = {
  // Chains (ADR 001, 005)
  SOLANA_RPC_URL: preserve(),
  SOLANA_RPC_FALLBACK: preserve(),
  RPC_ROBINHOOD_PRIMARY: preserve(),
  RPC_ROBINHOOD_FALLBACK: preserve(),
  RPC_BASE_PRIMARY: preserve(),
  RPC_BASE_FALLBACK: preserve(),
  RPC_BSC_PRIMARY: preserve(),
  RPC_BSC_FALLBACK: preserve(),
  // LiveKit, R2, alerts, Privy
  LIVEKIT_URL: preserve(),
  LIVEKIT_API_KEY: preserve(),
  LIVEKIT_API_SECRET: preserve(),
  R2_ENDPOINT: preserve(),
  R2_BUCKET: preserve(),
  R2_ACCESS_KEY_ID: preserve(),
  R2_SECRET_ACCESS_KEY: preserve(),
  R2_PUBLIC_BASE_URL: preserve(),
  ALERT_TELEGRAM_BOT_TOKEN: preserve(),
  ALERT_TELEGRAM_CHAT_ID: preserve(),
  PRIVY_APP_ID: preserve(),
  PRIVY_APP_SECRET: preserve(),
  // $APECAM tracker + payouts (D17)
  APECAM_CONTRACT: preserve(),
  APECAM_DEPLOY_BLOCK: preserve(),
  APECAM_INITIAL_SUPPLY_RAW: preserve(),
  WALLET_CREATOR_FEE: preserve(),
  WALLET_OPERATIONS: preserve(),
  WALLET_BUYBACK: preserve(),
  WALLET_BURN: preserve(),
  WALLET_TREASURY: preserve(),
};

/** Rebuild a service only when its own code or the shared packages change. */
const watch = (app: string) => [`apps/${app}/**`, 'packages/**', 'pnpm-lock.yaml', 'package.json'];

export default defineRailway((_ctx, project) => {
  // Names match Railway's defaults so an existing Postgres/Redis is kept, not recreated.
  const db = postgres('Postgres');
  const cache = redis('Redis');

  const web = service('@apecam/web', {
    source: github(REPO, { branch: BRANCH }),
    build: { buildCommand: 'pnpm turbo run build --filter=@apecam/web', watchPatterns: watch('web') },
    preDeploy: 'pnpm --filter @apecam/db migrate',
    start: 'pnpm --filter @apecam/web start',
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      APP_ORIGIN: preserve(),
      SESSION_JWT_PRIVATE_KEY: preserve(),
      SESSION_JWT_KID: preserve(),
      CF_ORIGIN_SECRET: preserve(),
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: preserve(),
      NEXT_PUBLIC_SOLANA_RPC: preserve(),
      ...sharedSecrets,
    },
  });

  const worker = service('@apecam/worker', {
    source: github(REPO, { branch: BRANCH }),
    build: { buildCommand: 'pnpm turbo run build --filter=@apecam/worker', watchPatterns: watch('worker') },
    start: 'pnpm --filter @apecam/worker start',
    healthcheck: '/health',
    healthcheckTimeout: 60,
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      R2_BACKUP_BUCKET: preserve(),
      ...sharedSecrets,
    },
  });

  // @apecam/spikes is deliberately absent: it is not a deployable app, and apply will remove that service.
  return project('apecam', { resources: [web, worker, db, cache] });
});
