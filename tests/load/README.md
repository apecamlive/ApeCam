# Load tests (S4-8)

| Test    | Tool                   | Target                                    | Pass when                                  |
| ------- | ---------------------- | ----------------------------------------- | ------------------------------------------ |
| T-S4-L1 | `lk load-test` (below) | 50 rooms × 20 viewers, 15 min             | No mass disconnects; web/worker CPU < 70%  |
| T-S4-L2 | `k6-feed.js`           | Home feed 200 RPS, 5 min                  | p95 < 300 ms, errors < 0.5%                |
| T-S4-L3 | `k6-view-token.js`     | view-token 50 RPS (+ token API 20 RPS)    | p95 < 300 ms                               |
| sanity  | `sanity.mjs` (Node)    | Local production build, fixed concurrency | errors < 0.5%; a smoke check, not a target |

Run L1–L3 against **staging** (same Railway plan as production), never production. The app's per-IP rate
limits apply to the load generator too: allow-list its IP in the staging Cloudflare / run from k6 cloud.

## T-S4-L1 · LiveKit

```bash
lk load-test --url $LIVEKIT_URL --api-key $LIVEKIT_API_KEY --api-secret $LIVEKIT_API_SECRET \
  --room apecam-load --publishers 1 --subscribers 20 --duration 15m --video-resolution medium
```

Run it 50 times in parallel with different `--room` names (or LiveKit Cloud's load-test tool). While it runs,
open a real stream and watch it from a phone: the product stream must stay smooth. Watch Railway metrics for
web and worker: webhooks from 50 rooms go to `/api/webhooks/livekit` (not rate limited).

## Sizing notes

- Web is stateless: scale replicas on CPU. The feed is cached 10 s in Redis per tab and page, so 200 RPS is mostly
  cache hits.
- Worker: one replica. `count-minutes` and `recheck-holdings` scale with live streams, not viewers.
- Postgres: most load is `count-minutes` inserts (one row per live stream per minute).
