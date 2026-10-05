# Security checklist (S4-7 / T-S4-M8)

Every row of the threat model (Implementation Plan §12), checked against the code on 2026-09-29.
**OK** = implemented and covered by an automated test. **Owner** = a setting outside the code.

| #   | Threat                                      | Status    | Where / evidence                                                                                                                                       |
| --- | ------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Login signature replay                      | OK        | Single-use nonce (`GETDEL`), 5 min expiry, domain/URI/chain checked: `apps/web/tests/auth.test.ts`                                                     |
| 2   | Tricking users into signing a transaction   | OK        | Plain-text sign-in only; ESLint bans `signTransaction`, `sendTransaction`, `writeContract`, `eth_sendTransaction`… (`eslint.config.mjs`)               |
| 3   | Forged embedded-wallet address              | OK        | Address read from Privy's server API, never the request body: `packages/core/src/privy.ts`, sprint 2 tests                                             |
| 4   | Borrowing a token to pass the holding check | OK        | Re-check every 5 min, `holding_checks` audit trail, liquidity minimum                                                                                  |
| 5   | Pumping a thin token's price                | OK        | Liquidity ≥ $5,000; price from the most liquid pair (ADR 002)                                                                                          |
| 6   | Stream to Earn farming                      | OK        | Viewer account ≥ 24 h, one stream per viewer per minute, unique minutes per user (D15), frame check, daily cap, admin void: sprint 3 tests             |
| 7   | Leaked LiveKit / RPC / Privy keys           | OK        | Server-only env vars; test pins the only two `NEXT_PUBLIC_` names (`apps/web/lib/security.test.ts`); gitleaks in CI (full history)                     |
| 8   | Spam / DoS                                  | OK        | Per-IP and per-user limits on every API route, 429 + `Retry-After` (`apps/web/lib/server/http.ts`, `tests/sprint4.test.ts`). Cloudflare WAF: **Owner** |
| 9   | Taking over someone else's stream           | OK        | End/status check the owner; LiveKit identity bound to user + room (sprint 1 tests)                                                                     |
| 10  | XSS via chat / names / titles               | OK        | React escaping; lint bans `dangerouslySetInnerHTML`/`__html`; display names reject markup; CSP; E2E renders an XSS title and asserts no script ran     |
| 11  | Malicious avatar upload                     | OK        | Image types only, size cap, re-encoded to 256 px WebP by `sharp`, served from the R2 domain                                                            |
| 12  | Forged LiveKit webhook                      | OK        | `WebhookReceiver` signature check before anything is processed; route is exempt only from CSRF/rate limit                                              |
| 13  | Exposed database                            | **Owner** | Railway: keep Postgres on the private network, public TCP proxy off                                                                                    |
| 14  | Direct attack on the Railway origin         | OK        | `proxy.ts` requires the Cloudflare-injected `x-apecam-origin` secret when `CF_ORIGIN_SECRET` is set (`/api/health` exempt). Transform Rule: **Owner**  |
| 15  | Wrong tracker / reward numbers              | OK        | `numeric(78,0)` + `bigint`, unit tests, `balanceOf` cross-check shown on `/burn`                                                                       |
| 16  | Hijacked admin / moderator account          | OK        | Role read from DB per request; every action logged; **new:** alert when one moderator bans ≥ 5 wallets in an hour                                      |

Also checked in Sprint 4:

- CSRF: every mutating route rejects a foreign `Origin` (T-S4-I3, 5 endpoints incl. admin).
- Security headers: CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy (camera /
  mic / display-capture self only), HSTS on HTTPS (T-S4-I5 + E2E).
- Rate-limit IP source: `CF-Connecting-IP`, else the **last** `X-Forwarded-For` hop (the first hop is
  client-controlled). Verify on staging that Railway appends the client IP as the last hop.
- OG images render text only: no server-side fetch of third-party logo URLs (no SSRF).
- Backups go to a separate **private** R2 bucket, never the public thumbnails bucket.
- `pnpm audit`: see the Sprint 4 report.

Open, not code: external security review before public launch (budget permitting), GitHub secret scanning
and Dependabot alerts switched on in the repository settings (free for public repositories).
