# Hooply — Screen Map (MVP)

Status: Draft for review · Date: 2026-07-06
Relates to: Phase 4 (issue #5). Depends on: docs/api-spec.md

## Navigation

Bottom tab bar, Fotmob-style:

```
[ Scores ]  [ Leagues ]  [ Following ]  [ Search ]
```

Settings lives behind a gear icon on Scores/Following headers — not worth a tab in MVP. Push notification tap deep-links straight to Game Detail.

## 1. Scores (home/dashboard)

The screen users live on. Horizontal date strip (± days, "Today" centered), games for the selected date grouped by league, ordered: leagues with a favorited team first, then league `priority`. Live games show score + period + clock and tick via polling.

- Data: `GET /v1/games?date=` on load/date change; poll `GET /v1/games/live` every 10–15s while visible and ≥1 game is live; merge into list.
- Row: `LAL 78 — 71 BOS · Q3 07:42` (live) / `Final` / tipoff time (scheduled, localized).
- Favorites-first ordering computed client-side from local favorites.
- States: no games that date ("No games today"); `delayed: true` → thin banner "Live scores may be delayed"; offline → cached last response + banner.

## 2. League Hub

Header: league logo/name + season label. Two tabs:

- **Matches** — fixtures & results, sectioned by date, infinite scroll both directions. `GET /v1/leagues/{id}/games?from=&to=`
- **Standings** — table (rank, team, P, W, L, pct, GB, streak), split by conference/group when present, favorited teams highlighted. `GET /v1/leagues/{id}/standings`

Follow/unfollow league button in header.

## 3. Game Detail

Deep-link target from notifications. Header: both teams (logo, code, tappable → Team Page), big score, status line (period + clock / Final / tipoff time), period-score strip beneath (Q1–Q4 + OTs).

Tabs:
- **Summary** — period scores table, top performers per team (top 3 by points from boxscore), venue.
- **Box Score** — per-team tables: player rows (name, MIN, PTS, REB, AST, ±, FG, 3P, FT), starters first, team totals row. `GET /v1/games/{id}/boxscore`; 404 → "Stats not yet available".
- **Plays** — reverse-chronological feed. Hidden entirely if endpoint 404s (provider-dependent).

Polling: `GET /v1/games/{id}` every 10–15s while visible and status is live/halftime; boxscore refetched on a slower cadence (~30s) only while the tab is open. Stops when screen loses focus.

## 4. Team Page

Header: logo, name, league, current record + standing position ("3rd West · 42–18"), follow/unfollow star (the notification driver).

Tabs:
- **Matches** — next games + recent results. `GET /v1/teams/{id}/games?window=…`
- **Roster** — grouped by position: number, name, position. `GET /v1/teams/{id}/roster`

## 5. Player Page

Header: photo, name, team (tappable), position/number, physicals/country.

- **Season averages** stat cards: PPG, RPG, APG, MPG, FG%, 3P%, FT%. From `GET /v1/players/{id}`.
- **Game log** — one row per game: opponent, result, MIN/PTS/REB/AST, paginated. `GET /v1/players/{id}/stats`.

## 6. Search

Search bar autofocus, debounced `GET /v1/search?q=` (≥2 chars). Grouped results: Teams / Leagues / Players, each row tappable to its page, star to follow inline. Recent searches stored locally.

## 7. Following

The favorites hub: followed teams & leagues with next-game info per team, manage (unfollow) inline. Below, "Today for you": games today involving followed entities. Empty state = onboarding prompt ("Follow teams to get scores and notifications").

- Data: local favorites + `GET /v1/games?date=today`, `GET /v1/teams/{id}` per followed team (batched/cached).

## 8. Onboarding (first launch, 2 steps, skippable)

1. Pick favorite teams — league picker → team grid, star to follow.
2. Notification permission prompt (only after step 1, so the ask has context) → register device: `POST /v1/devices`, then `PUT /v1/devices/{id}/favorites`.

## 9. Settings (modal/stack, not a tab)

- Notifications: master toggle + per-event toggles (game start / score swings / final). Stored on device; used to filter locally + sent with device registration (post-MVP: server-side filtering).
- About, privacy policy (required for App Store), licenses, app version.

## Cross-cutting

- **Local store**: favorites (`entity_type`, `entity_id`, name, logo cached), device_id, notification prefs, recent searches — AsyncStorage/MMKV, synced to server only for notification routing.
- **Deep links**: `hooply://game/{id}`, `hooply://team/{id}` — notifications carry the game id.
- **Skeleton loaders** everywhere instead of spinners; cached-data + banner over error screens whenever we have anything to show.
