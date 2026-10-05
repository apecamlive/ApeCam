# LiveKit down

**You notice:** viewers see "stream unavailable", streamers cannot go live, `frame-check` / `stale-streams`
failing in Admin → Health, LiveKit status page shows an incident.

What the app does on its own:

- Going live fails with "Streaming service unavailable, try again"; the half-created stream is marked ended.
- While LiveKit's API is down, `stale-streams` fails (alerted after 3 runs). Once it is back, the job ends
  every stream whose LiveKit room no longer exists, within a minute.
- Stream to Earn: `frame-check` cannot confirm video, so minutes are **not** counted during the outage
  (by design: unverifiable minutes are never paid).
- Chat messages are still saved and shown to the sender; others see them after reload (the live relay is
  LiveKit).

What you do:

1. Confirm on the LiveKit Cloud status page / dashboard. Check `LIVEKIT_URL` and keys were not changed.
2. Post a short notice (X / Telegram). No action in APECAM is needed; it recovers when LiveKit does.
3. After a long outage, consider a goodwill note: missed minutes are not restored automatically.
