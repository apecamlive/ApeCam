# Moderator guide (closed beta + launch week)

Share this with every moderator before their first shift (B-3).

## Before your shift

- Sign in at `/admin` with your moderator wallet. You should see: Reports, Live streams, Action log,
  Go Live access. (Payouts / Config / Health are admin only.)
- Join the alert channel (Telegram). Everything important is posted there.
- Know who the on-call developer is today.

## Alerts you will see

| Alert                                    | What to do                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "Auto-blurred after 3 reports"           | Open Admin → Reports now. Kill, or Dismiss to unblur.                                              |
| Severe category report (self-harm, …)    | Same, immediately. See [stream-incident.md](stream-incident.md).                                   |
| "⏰ Report open > 15 min"                | Someone missed it. Handle it now; target is < 15 minutes.                                          |
| "🚨 … banned N wallets in the last hour" | Check the Action log. If it was not a moderator, tell the developer: that account may be hijacked. |
| "🔒 Go Live is now …"                    | Someone changed Go Live access. Check the reason in the Action log.                                |
| Job failed / tracker lagging             | Not yours. The developer on call handles it.                                                       |

## The four actions

1. **Kill stream**: ends one stream for everyone. Use for anything against the rules.
2. **Ban wallet**: 24 h / 7 days / permanent. Ends all their streams and signs them out everywhere.
3. **Hide token**: the token disappears from feed and search and its streams stop. For scam tokens.
4. **Dismiss**: the reports were wrong. Lifts auto-blur.

Always write a clear reason. It is saved in the Action log and other moderators read it.

## Emergency: close Go Live

Admin → **Go Live access** → **Emergency: close Go Live**. Use it when streams arrive faster than you can
review them (raid, coordinated abuse). Nobody can start a new stream; watching and chat keep working. Tick
"Also end every stream that is live right now" only if the live streams themselves are the problem.
Reopen from the same tab when it is under control. Both steps are posted to the alert channel.

## Closed beta: invites

Admin → Go Live access → paste wallet addresses (one per line) → Invite. Streamers can be invited before
they ever sign in. "Signed in: not yet" shows who has not tried it yet.
