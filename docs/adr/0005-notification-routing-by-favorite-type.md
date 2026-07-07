# Notification routing by favorite type; score-change notifications deferred

Push notifications are routed differently depending on what the device has favorited:

- **Team follow**: `game_started`, `game_finished`, `game_postponed`
- **League follow**: `game_started`, `game_finished` (all games in the league)

Score-change notifications are not sent at MVP. The ingestion worker emits `score_change` events, but nothing consumes them for push delivery yet.

Score-change notifications are too noisy without a user-configurable threshold (e.g. "notify me on lead changes only," "last 2 minutes only"). The Settings screen has toggles for "score swings" as a placeholder, but they are no-ops until post-MVP. Sending unfiltered score-change pushes — potentially dozens per game per followed team — would drive uninstalls.

League follows intentionally receive fewer events than team follows. A league follower wants to know when basketball is happening; a team follower wants to know how their team is doing. The distinction is surfaced here because the `favorite` table makes no structural difference between the two — the routing logic is the only place this asymmetry is enforced.
