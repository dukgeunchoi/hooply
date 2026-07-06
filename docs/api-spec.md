# Hooply — API Spec (MVP)

Status: Draft for review · Date: 2026-07-06
Relates to: Phase 2 (issue #3). Depends on: docs/data-model.md

REST + JSON, versioned under `/v1`. The API reads **only** from Postgres/Redis — never proxies the provider. No user auth in MVP; the only writes are device registration and favorites sync.

## Conventions

**Envelope** — every success response:

```json
{
  "data": { },
  "meta": { "generated_at": "2026-07-06T13:40:00Z", "delayed": false }
}
```

`meta.delayed: true` when the underlying data is stale (provider outage — game `updated_at` older than ~60s while status is live). The client shows a "scores may be delayed" banner instead of an error.

**Errors:**

```json
{ "error": { "code": "not_found", "message": "Game not found" } }
```

Codes: `bad_request`, `not_found`, `rate_limited`, `internal`. HTTP status matches.

**IDs** are Hooply UUIDs (never provider refs). **Timestamps** are UTC ISO 8601; client localizes. **Pagination** is cursor-based: `?cursor=&limit=` → `meta.next_cursor`.

**Caching (server-set `Cache-Control`):**
| data | policy |
|---|---|
| leagues, teams, players | `public, max-age=3600` |
| standings, schedules | `public, max-age=300` |
| live games, game detail while live | `no-store` |
| finished game detail/boxscore | `public, max-age=3600` |

## Endpoints

### Leagues
- `GET /v1/leagues` — active leagues, ordered by `priority`. Includes `current_season_id`.
- `GET /v1/leagues/{id}/standings?season={season_id}` — defaults to current season. Grouped by conference/group when present.
- `GET /v1/leagues/{id}/games?date=2026-07-06` or `?from=&to=` or `?status=live` — schedule & results.

### Games
- `GET /v1/games?date=2026-07-06` — dashboard feed: all games across active leagues for a date, grouped by league. Favorites-first ordering happens **client-side** (favorites are on-device).
- `GET /v1/games/live` — id, status, period, clock, scores for every in-progress game. This is the cheap polling target (Redis-backed). Clients poll it every 10–15s while a live view is visible.
- `GET /v1/games/{id}` — full detail:

```json
{
  "data": {
    "id": "…", "status": "live", "period": 3, "clock": "07:42",
    "tipoff_at": "2026-07-06T00:30:00Z", "venue": "Crypto.com Arena",
    "league": { "id": "…", "name": "NBA" },
    "home": { "team": { "id": "…", "name": "Lakers", "code": "LAL", "logo_url": "…" },
              "score": 78, "period_scores": [28, 25, 25] },
    "away": { "team": { "id": "…", "name": "Celtics", "code": "BOS", "logo_url": "…" },
              "score": 71, "period_scores": [30, 22, 19] }
  },
  "meta": { "generated_at": "…", "delayed": false }
}
```

- `GET /v1/games/{id}/boxscore` — `team_stats` (both teams) + `player_stats` (array of stat lines, grouped by team, starters flagged). 404 until stats exist; client treats 404 as "not yet available".
- `GET /v1/games/{id}/plays?cursor=` — play-by-play, newest first. **Only if provider supports it**; otherwise the endpoint returns `not_found` and the client hides the tab.

### Teams
- `GET /v1/teams/{id}` — profile + current-season record/standing summary.
- `GET /v1/teams/{id}/games?window=upcoming|past&limit=10` — team schedule/results.
- `GET /v1/teams/{id}/roster?season={season_id}` — players with jersey/position.

### Players
- `GET /v1/players/{id}` — profile + current-season averages (computed on read: pts/reb/ast/min per game, shooting %).
- `GET /v1/players/{id}/stats?season={season_id}&cursor=` — game log.

### Search
- `GET /v1/search?q=lak` — min 2 chars, results grouped:

```json
{ "data": { "teams": [ … ], "players": [ … ], "leagues": [ … ] } }
```

Backed by pg_trgm indexes. Limit 5 per group, no pagination in MVP.

### Devices & favorites (the only writes)
- `POST /v1/devices` — body `{ "device_id": "<client-generated uuid>", "platform": "ios", "push_token": "…" }`. Idempotent upsert keyed on `device_id`. Called on first launch and whenever the push token rotates.
- `PUT /v1/devices/{device_id}/favorites` — full replace: `{ "favorites": [ { "entity_type": "team", "entity_id": "…" } ] }`. Client sends the whole list after any local change (simpler than add/remove deltas and self-healing).

No auth beyond possession of the `device_id` UUID. Acceptable at MVP risk level: worst case someone alters a stranger's notification preferences by guessing a v4 UUID.

## Rate limiting

Per-IP token bucket at the edge (e.g. 60 req/min sustained, burst 120). `429` + `Retry-After`. Protects Postgres if a client polling loop goes wrong.

## Polling contract (client behavior)

- Poll `GET /v1/games/live` (dashboard) or `GET /v1/games/{id}` (game screen) every **10–15s only while the screen is visible and at least one game is live**.
- On background/blur: stop polling entirely (push notifications cover the gap).
- On `meta.delayed: true`: keep polling, show the delayed banner.
- On `429` or `5xx`: exponential backoff starting at 30s.

## Non-goals (MVP)

GraphQL, user accounts/auth, WebSocket/SSE (Path to Scale), write access to anything except devices/favorites, admin endpoints (seed/backfill run as scripts, not HTTP).
