# Runbooks

Short, do-this-now guides for when something breaks in production. Each one starts with how you notice the
problem, then the steps in order.

| Situation                                        | Runbook                                            |
| ------------------------------------------------ | -------------------------------------------------- |
| First production deploy / environment checklist  | [deploy-railway.md](deploy-railway.md)             |
| Telegram: "Job X failed 3 times in a row"        | [job-failing.md](job-failing.md)                   |
| Telegram: "Burn tracker is lagging"              | [tracker-lagging.md](tracker-lagging.md)           |
| Harmful stream live / auto-blur alert            | [stream-incident.md](stream-incident.md)           |
| RPC provider down                                | [job-failing.md](job-failing.md) (first table row) |
| LiveKit down                                     | [livekit-down.md](livekit-down.md)                 |
| Bad deploy                                       | [rollback.md](rollback.md)                         |
| Database lost or corrupted, need a restore       | [restore-database.md](restore-database.md)         |
| A secret leaked (key in a log, repo, screenshot) | [rotate-secrets.md](rotate-secrets.md)             |
| Moderators: shifts, alerts, emergency close      | [moderator-guide.md](moderator-guide.md)           |
| Beta incident drill (report → kill < 5 min)      | [incident-drill.md](incident-drill.md)             |
| Launch day and launch week                       | [launch-day.md](launch-day.md)                     |

Where to look first:

- **Admin → Health** (admin only): every worker job's last run, failures in a row, tracker lag, live streams.
- **Railway logs**: web and worker log one JSON line per event. Search `"level":"error"`. A user who saw
  "Reference: abc123" on an error page gives you the `digest` to search for.
- **`/api/health`** (web) and **`/health`** (worker): database and Redis checks.
