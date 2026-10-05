# Launch day (L-3 … L-8)

## The day before

- [ ] Launch checklist (Implementation Plan §19) all ticked. Open items have an owner and a decision.
- [ ] Production secrets rotated away from staging values ([rotate-secrets.md](rotate-secrets.md)).
- [ ] `APECAM_CONTRACT`, `APECAM_DEPLOY_BLOCK` and the five `WALLET_*` variables checked by **two people**
      against the explorer. Compare with the wallet cards on `/burn` after deploy.
- [ ] Moderator shifts for 7 days published; on-call developer named for each day.
- [ ] Go Live access decided: stay **invite** for launch morning and open later, or open at launch.

## Deploy (weekday morning, audience time zone)

1. Merge to `production`; Railway deploys web + worker (migrations run in pre-deploy).
2. Smoke test, automated part (1 minute):
   `node tests/smoke/smoke.mjs https://<domain>` — or GitHub → Actions → **Smoke** → Run workflow.
3. Smoke test, manual part (Sprint Tasks §J rows 2, 3, 4, 7, 9, 15): wallet logins, go live on camera and
   screen, watch signed out, chat between two devices, iPhone.
4. Admin → Health: all jobs `ok` within 10 minutes; tracker "in sync".
5. Go Live access → **Open** (reason: "public launch").

## During launch week (daily, T-L-M2 / L-8)

- 00:20 UTC the daily report lands in the alert channel: streams, streamers, viewers, reports and median
  time to action, bans, broken jobs, tracker. Read it every morning.
- Report queue: nothing open > 15 minutes (there is an alert if so).
- LiveKit and Railway usage vs budget.
- One real live flow by the team each day (T-L-M3).

## If it goes wrong

- Abuse faster than moderators can handle → Admin → Go Live access → **Emergency: close Go Live**.
- Bad deploy → [rollback.md](rollback.md). Everything else → [README.md](README.md).
