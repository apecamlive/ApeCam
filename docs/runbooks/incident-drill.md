# Incident drill (B-4 / T-B-M2)

Once during the closed beta, on staging or production with the team only. Target: **first report → kill
under 5 minutes**. The same flow is covered automatically by `apps/web/e2e/moderation.spec.ts`; this drill
tests the _people_: alerts reaching phones, a moderator reacting, the right buttons pressed.

## Setup (developer)

1. Pick a "bad streamer" (a team member with an invited, funded wallet) and three "viewers" (three other
   signed-in wallets, accounts older than a day).
2. Do **not** warn the moderator on shift about the exact time.

## Run

| Time | Who            | Step                                                                                   |
| ---- | -------------- | -------------------------------------------------------------------------------------- |
| T0   | Bad streamer   | Go live with a clearly marked test title, e.g. "DRILL: fake scam giveaway".            |
| T0+1 | Viewer 1, 2, 3 | Report the stream (category Scam), within 5 minutes of each other.                     |
| —    | System         | Stream auto-blurs after the 3rd report; alert posted.                                  |
| —    | Moderator      | Opens Admin → Reports, **kills** the stream, **bans** the wallet (24 h).               |
| —    | Developer      | Afterwards: unban the test wallet (`POST /api/admin/wallets/<address>/unban`, logged). |

## Measure

- Time from the first report to the kill: Admin → Action log (`kill_stream`) vs the report time in
  Admin → Reports, or the next morning's daily report ("median to action").
- Did the alert arrive on the moderator's phone? How long after the 3rd report?
- Pass: < 5 minutes, and nobody had to be told what to do.

Write the result in the beta report (T-B-M2). If it failed, fix the cause (notifications, shift gap,
unclear UI) and repeat.
