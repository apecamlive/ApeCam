# APECAM

Hold it. Stream it. — permissionless tokenized livestreaming.

Planning docs live one folder up: `APECAM-Developer-Brief.md`, `APECAM-Implementation-Plan.md`, `APECAM-Sprint-Tasks-and-Testing.md`. Technical decisions from spikes are in [`docs/adr/`](docs/adr).

## Layout

```
apps/web        Next.js app + API routes (Railway service "web")
apps/worker     Scheduled jobs (Railway service "worker")
packages/core   Domain logic shared by web and worker: eligibility, streams, chat, feed, search, jobs
packages/*      shared, db (Drizzle schema + migrations), chain (Solana/EVM adapters), pricing
                (DexScreener), storage (R2), rewards and tracker (Sprint 3)
spikes/         Sprint 0 experiments (not deployed)
tests/          Cross-package integration tests
```

## Local development

Requirements: Node 22 (`.nvmrc`), pnpm 11, Docker Desktop (for Postgres + Redis).

```bash
pnpm install
cp .env.example apps/web/.env.local   # then fill in DATABASE_URL and the session key
pnpm --filter @apecam/web gen:session-key >> apps/web/.env.local
docker compose up -d                  # or, without Docker: pnpm --filter @apecam/db dev
pnpm --filter @apecam/db migrate      # the PGlite dev server migrates itself
pnpm --filter @apecam/db seed:demo    # optional: demo tokens + fake live streams for UI review
pnpm dev
```

Without LiveKit credentials the app runs fully except joining/publishing video (the API answers `503 STREAMING_UNAVAILABLE`).

- Web: http://localhost:3000 — health at `/api/health`
- Worker: health at http://localhost:8081/health

**Developers in Indonesia:** ISP DNS blocks `*.robinhood.com`. Use encrypted DNS (DoH/DoT, e.g. 1.1.1.1) or a VPN, otherwise Robinhood Chain RPC calls fail with TLS errors. See ADR 001.

## Checks (same as CI)

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration   # needs Postgres + Redis (docker compose up -d)
pnpm build
```

The lint config blocks any code that signs or sends wallet transactions. APECAM only ever asks users to sign plain-text login messages.

## Railway

One Railway project with services `web`, `worker`, `Postgres`, `Redis`, and environments `staging` (deploys from `main`) and `production` (deploys from `production`). Each app service points its config-as-code path to its own `railway.json`:

- `web` → `/apps/web/railway.json` (health check `/api/health`)
- `worker` → `/apps/worker/railway.json` (health check `/health`)

Set `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `REDIS_URL=${{Redis.REDIS_URL}}` on both app services. Turn off the Postgres public TCP proxy and enable "Wait for CI".
