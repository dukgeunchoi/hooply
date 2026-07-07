# Game status represents lifecycle phase, not clock state

The `game.status` enum uses lifecycle-phase values (`scheduled`, `live`, `final`, `suspended`, `postponed`, `cancelled`) rather than clock-state values. There is no `halftime` status — all in-game states, including inter-quarter breaks, map to `live`. The `period` and `clock` fields carry the granular clock state.

This distinction matters because the polling contract is lifecycle-driven: `GET /v1/games/live` returns games where `status = 'live'`, which is what clients need to decide whether to poll. If `halftime` were a separate status, clients would need to enumerate multiple values and the live-feed endpoint would need to union them.

`suspended` is intentionally distinct from `postponed`: a suspended game tipped off and has real partial scores; a postponed game never started. A future reader might assume `postponed` covers both — it doesn't.

## Considered options

- `halftime` as a separate status — rejected because it conflates clock state with lifecycle phase and complicates the polling feed without adding client value.
- `in_progress` as a single all-game status — rejected because `suspended` genuinely needs a separate value: clients stop polling it, but still show partial scores rather than a blank state.
