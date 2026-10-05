# E2E (Playwright)

```bash
pnpm --filter @apecam/web build
pnpm --filter @apecam/web e2e
```

Playwright starts two servers itself:

1. `pnpm --filter @apecam/db e2e:db`: in-memory PGlite on port 54330, migrated and seeded
   (`packages/db/src/e2e-server.ts`): two tokens, four live streams (one with an XSS title), an admin wallet.
2. `next start -p 3100` against that database. No Redis, LiveKit or chain RPCs.

Sign-in goes through the real API with a local test key (`e2e/fixtures.ts`); only the wallet extension popup
itself is not automated. Every test uses its own client IP so the real rate limits do not interfere.

| ID      | Spec                                  | Covers                                                               |
| ------- | ------------------------------------- | -------------------------------------------------------------------- |
| T-S4-E1 | `viewer.spec.ts`                      | Home → room → sign in → chat → report; 404; security headers         |
| T-S4-I4 | `viewer.spec.ts`                      | XSS payload in a title renders as text, never executes               |
| T-S4-E2 | `streamer.spec.ts`                    | Studio up to the Go Live button (rules + 18+ gate); start API 18+    |
| T-S4-E3 | `moderation.spec.ts`                  | 3 reports → auto-blur → admin kill + ban → action log; 403 for users |
| T-S4-E4 | `a11y.spec.ts`                        | axe WCAG 2.1 AA, no serious/critical issues on 6 pages               |
| S4-2    | `viewer.spec.ts` (`@mobile`, Pixel 7) | No horizontal scroll, bottom navigation                              |

Not covered here (needs real services): video going live, LiveKit chat echo, wallet popups, on-chain
eligibility. Those are in the manual device matrix (T-S4-M1) on staging.
