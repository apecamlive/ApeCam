# Deploy to Railway (production checklist)

## Services

One Railway project, four services:

| Service  | Source                | Notes                                                                               |
| -------- | --------------------- | ----------------------------------------------------------------------------------- |
| web      | `.railway/railway.ts` | **2 replicas**. Runs migrations in `preDeployCommand`, health check `/api/health`   |
| worker   | `.railway/railway.ts` | One replica. BullMQ job schedulers are idempotent, so redeploys are safe            |
| Postgres | Railway template      | Enable **volume backups** (daily) in the service settings; public TCP proxy **off** |
| Redis    | Railway template      | Nonces, rate limits, caches, BullMQ, job health records. Turn on persistence (AOF)  |

Web replicas share all state through Postgres + Redis (sessions are stateless JWTs), so any number works.
Without Redis every replica would keep its own rate-limit counters and nonces: production must have
`REDIS_URL`.

Services, build/start commands, health checks and variable wiring are defined in `.railway/railway.ts`
(Railway Infrastructure as Code; `railway.json` config-as-code is deprecated and stops working for legacy
services on 2026-12-01). Both app services build from the **repository root**: the monorepo needs
`pnpm-lock.yaml`, `pnpm-workspace.yaml` and `packages/*`, otherwise Railway falls back to `npm install` and fails
on `workspace:*`.

```bash
railway login && railway link   # Railway CLI 5.42.1 or newer
railway config plan             # review every "delete" before applying
railway config apply
```

Secrets are not in the file (`preserve()` keeps the dashboard value): set them in Railway → Variables.
Once apply has succeeded, delete `apps/web/railway.json` and `apps/worker/railway.json`.

## Environment

Copy `.env.example`. Required in production:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}` on **both** services.
- `APP_ORIGIN=https://<your domain>` (web). Sign-in messages and CSRF checks use it; it must match exactly.
- `SESSION_JWT_PRIVATE_KEY` + `SESSION_JWT_KID` (web): `pnpm --filter @apecam/web gen:session-key`.
- `CF_ORIGIN_SECRET` (web): a long random string. Then in Cloudflare → Rules → Transform Rules → Modify
  request header, add `x-apecam-origin: <same secret>` for the domain. Requests that skip Cloudflare get 403.
- Chains: `SOLANA_RPC_URL` (Helius), `RPC_ROBINHOOD_PRIMARY` (Alchemy), Base/BSC RPCs.
- LiveKit, R2 (`R2_*`, including the **private** `R2_BACKUP_BUCKET`), Telegram alerts, Privy.
- `NEXT_PUBLIC_*` **and `APP_ORIGIN`** are read at build time too (security headers incl. HSTS,
  robots.txt, OG/metadata base URL): change them, then redeploy web. Railway passes service variables to the
  build, so nothing extra is needed as long as they are set before the first deploy.

Never paste a secret into a `NEXT_PUBLIC_` variable. A unit test checks the allowed list.

## Cloudflare

- DNS proxied (orange cloud) to the Railway domain. SSL mode **Full (strict)**.
- Cache: bypass for `/api/*`; the app sets its own cache headers elsewhere.
- WAF rate limiting is optional: the app already limits per IP / user (Implementation Plan §6).

## R2

- Public bucket (thumbnails, avatars, snapshots) with a custom domain → `R2_PUBLIC_BASE_URL`.
- Private bucket for backups → `R2_BACKUP_BUCKET`. **No public access.** Lifecycle rule: delete objects older
  than 30 days.

## After the first deploy

1. `https://<domain>/api/health` → `{"ok":true}`.
2. Worker logs show `worker started` with all job names; Admin → Health shows jobs turning `ok` within minutes.
3. Promote the owner's wallet to admin (one-off, Railway Postgres console):
   `update users set role = 'admin' where id = (select user_id from wallets where address = '<lowercase 0x…>');`
4. Send a test alert: stop Redis for a few minutes on a staging project and watch for the job-failure message,
   or temporarily set a wrong RPC URL.
5. `https://<domain>/robots.txt` and `/sitemap.xml` point at the production domain.
