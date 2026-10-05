# Rotate a leaked secret

Rotate first, investigate after. The repository is public: a secret pushed to GitHub is compromised even if
the commit is deleted.

| Secret                     | Rotate at                                                                            | Side effect                                         |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `SESSION_JWT_PRIVATE_KEY`  | `pnpm --filter @apecam/web gen:session-key`, set new key + **new** `SESSION_JWT_KID` | Everyone is signed out                              |
| `LIVEKIT_API_KEY/SECRET`   | LiveKit Cloud → Settings → Keys                                                      | Live streams drop; streamers go live again          |
| `R2_ACCESS_KEY_ID/SECRET`  | Cloudflare → R2 → Manage API tokens                                                  | None if updated on web + worker together            |
| `ALERT_TELEGRAM_BOT_TOKEN` | @BotFather → /revoke                                                                 | None                                                |
| `PRIVY_APP_SECRET`         | Privy dashboard                                                                      | None                                                |
| RPC keys (Helius, Alchemy) | Provider dashboard                                                                   | None                                                |
| `CF_ORIGIN_SECRET`         | New random value on web **and** the Cloudflare Transform Rule, same minute           | Brief 403s if out of sync                           |
| Database / Redis passwords | Railway → service → regenerate                                                       | Railway updates referenced variables; redeploy both |

After rotating: redeploy web and worker, check `/api/health`, and search logs for use of the old key.

APECAM never holds wallet private keys, so there is no wallet key to rotate. The owner's treasury and
operations wallets are outside this system.
