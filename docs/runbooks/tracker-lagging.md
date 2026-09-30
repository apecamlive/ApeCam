# Burn tracker is lagging

**You notice:** Telegram "⚠️ Burn tracker is lagging: N min behind", `/burn` "last synced" is old, or the
tracker card in Admin → Health says "lagging". Normal lag is ~9 minutes (the tracker reads up to the `safe`
block, ADR 001) plus up to 5 minutes between runs. The alert fires above 30 minutes, at most once an hour.

## Steps

1. Admin → Health → `sync-tracker` row. If it is failing, follow [job-failing.md](job-failing.md) (almost
   always the Robinhood Chain RPC).
2. If `sync-tracker` is **ok** but the tracker still lags: the RPC is returning an old `safe` block. Compare
   with the Robinhood Chain explorer. Switch `RPC_ROBINHOOD_PRIMARY` to the fallback if they differ.
3. Big gap after a long outage: the job catches up by itself in windows of up to 1,000,000 blocks per run
   (halved automatically when the RPC limits log results). Nothing to do but wait; watch "last block" climb.
4. `/burn` shows a warning when the indexed burn total differs from the burn address balance on chain. That
   means missed logs: stop the worker, set the `sync_cursors` row `tracker:robinhood` back to a block before
   the gap, start the worker. Re-indexing is idempotent (rows are keyed by tx hash + log index).
