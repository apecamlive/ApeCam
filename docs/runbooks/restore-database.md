# Restore the database

There are two backups. Prefer the first.

1. **Railway volume backups** (Postgres service → Backups): whole-database snapshots. Restore from the Railway
   UI. Fastest and complete (includes chat and holding checks).
2. **Daily logical backup** in the private R2 bucket (`R2_BACKUP_BUCKET`, key `db/YYYY-MM-DD.json.gz`, written
   by the `backup-db` job at 02:30 UTC). Covers users, wallets, tokens, streams, minutes, rewards, payouts,
   reports, moderation log, tracker data, cursors and config. Not included: chat messages and holding checks
   (high volume, not needed to run the product).

## Restoring the logical backup

1. Put the site in a safe state: scale the **worker** to 0 replicas (no jobs writing).
2. Download the file from R2 (Cloudflare dashboard → R2 → bucket → `db/…` → Download).
3. Create a fresh Postgres (or empty the existing one) and migrate it to the version the backup was taken at:
   `DATABASE_URL=… pnpm --filter @apecam/db migrate`
   (check out the git commit that was deployed on the backup date if the schema changed since).
4. Restore:
   `DATABASE_URL=… pnpm --filter @apecam/db restore ./2026-10-01.json.gz`
   It refuses a non-empty database. `--replace` truncates the backed-up tables first. The restore is one
   transaction: it either loads everything or nothing. A different migration version is refused.
5. Point web + worker `DATABASE_URL` at the restored database, redeploy, scale the worker back to 1.
6. After restore: `sync-tracker` catches up from its restored cursor by itself. Rewards for days after the
   backup are recreated by `close-rewards` only for minutes that exist; minutes after the backup are lost.

## Test it

`packages/db/src/backup.test.ts` restores a backup into a fresh database and compares every row. Once a
quarter, also restore the latest real backup into a scratch Railway Postgres and open the site against it.
