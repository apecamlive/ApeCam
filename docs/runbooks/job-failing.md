# A worker job keeps failing

**You notice:** Telegram "⚠️ Job `<name>` failed 3 times in a row: …", or a red / amber row in Admin → Health.
A job that has not run for 3× its interval shows as **stalled** (the worker itself is probably down).

## Steps

1. **Is the worker running?** Railway → worker → Deployments. If it crashed, check the last logs, then
   redeploy. `stalled` on every job = worker down or Redis down.
2. **Read the error** in Admin → Health (last error column) or worker logs (`"msg":"job failed"`).
3. Match it:

| Error looks like                                   | Likely cause                       | Do this                                                                |
| -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `ChainRpcError`, timeouts, 429 from an RPC         | RPC provider down or over quota    | Check the provider status page; switch `*_PRIMARY`/`*_FALLBACK` vars   |
| DexScreener 429 / 5xx (`refresh-prices`)           | Price API limits                   | Usually self-heals; holdings checks are fail-open for 10 min (ADR 002) |
| `ECONNREFUSED` / `Connection terminated` (DB)      | Postgres restarting or out of disk | Railway → Postgres metrics; resize volume if full                      |
| LiveKit 401 / 5xx (`frame-check`, `stale-streams`) | Wrong keys or LiveKit incident     | Check `LIVEKIT_*`; LiveKit status page                                 |
| R2 `AccessDenied` (`frame-check`, `backup-db`)     | Key rotated or bucket renamed      | Update `R2_*` on web + worker                                          |

4. When the job succeeds again, Telegram gets "✅ recovered". No manual reset is needed.

## Job-specific notes

- `close-rewards` (00:10 UTC) closes yesterday **and re-closes the two days before**, so a missed night is
  caught up by the next run (up to 2 days of outage). It is idempotent and never touches batched, paid or
  void rewards. For a longer outage, create the weekly payout batch only after the missing days are closed.
- `count-minutes` failing means streamers are **not** earning for those minutes. Minutes are not back-filled
  (by design: they can no longer be verified). Tell affected streamers if the outage was long.
- `recheck-holdings` failing is fail-open (streams keep running) for 10 minutes, then streams are ended with
  a clear message. See ADR 002.
