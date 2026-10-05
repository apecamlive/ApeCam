# Roll back a bad deploy

**You notice:** errors spike right after a deploy, `/api/health` fails, or a page is broken.

1. Railway → service (web or worker) → Deployments → the last good deployment → **Redeploy**. Takes 1–3
   minutes; Railway switches traffic only after the health check passes. Target: back to normal in < 5 min.
2. Roll back web and worker together if the deploy touched `packages/` (both run the same domain code).
3. **Migrations are not rolled back automatically.** Migrations in this repo are additive (new tables/columns),
   so the previous app version keeps working on the newer schema. If a migration was destructive, restore
   instead: [restore-database.md](restore-database.md).
4. Revert the commit on `main` so the next deploy does not bring the bug back.

`NEXT_PUBLIC_*` variables and `APP_ORIGIN` are baked into the web build (security headers, robots.txt,
sitemap and OG base URL): after changing them, redeploy web; a rollback restores the old build's values.
