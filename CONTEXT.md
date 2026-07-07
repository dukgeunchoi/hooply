# Hooply

A livescore basketball app. Users track live scores, standings, schedules, and player/team stats across multiple leagues. No user accounts — identity is per-device.

## Language

### Games

**Game**:
A scheduled contest between exactly two teams (home and away) within a season. A game has a lifecycle: it starts as `scheduled`, becomes `live` when play begins, and ends as `final`. It may be `suspended` mid-play or `postponed`/`cancelled` before tip-off.
_Avoid_: Match, fixture, contest

**Tip-off**:
The scheduled start time of a game (`tipoff_at`). Distinct from when the game actually goes `live` — the provider detects the actual start; `tipoff_at` is the advertised time.
_Avoid_: Kick-off, start time

**Live**:
A game currently in progress — any period, including inter-quarter breaks and timeouts. The single status value covering all in-game states.
_Avoid_: In-progress, active, ongoing (use "live")

**Suspended**:
A game that tipped off (has real scores) but has been paused indefinitely — weather, arena issue, etc. Distinct from `postponed`, which means the game never started. A suspended game may resume (returning to `live`) or be rescheduled.
_Avoid_: Delayed, paused (for mid-game halts — use "suspended")

**Postponed**:
A game that was scheduled but never tipped off, moved to a later date. No partial scores exist.
_Avoid_: Suspended (reserve that for mid-game pauses)

**Period**:
A quarter of play, numbered 1–4. OT periods continue as 5, 6, etc. During an inter-quarter break, `period` holds the number of the quarter just completed and `clock` is `"00:00"`.
_Avoid_: Quarter (in code and API — use "period"; "quarter" is fine in UI copy)

**Clock**:
The time remaining in the current period, as a string `"MM:SS"` (e.g. `"07:42"`). `"00:00"` during inter-quarter breaks. Not a real-time countdown — updated on each ingestion poll.
_Avoid_: Timer, countdown

**Box Score**:
The per-player statistical line for a game: points, rebounds, assists, shooting splits, etc. Represented as `PlayerGameStat` rows. May not be available until mid-game or post-game depending on the provider.
_Avoid_: Stats, game stats (use "box score" when referring to the full per-player table)

**Period Scores**:
The score each team accumulated in each period, stored as a JSONB array. Handles any number of OT periods.
_Avoid_: Quarter scores, score by period

### Leagues & Seasons

**League**:
A named competition (e.g. NBA, EuroLeague). Persists across seasons. Has a `quarter_duration_mins` (NBA=12, FIBA/WNBA=10) and `ot_duration_mins` (5 for all). Active leagues (`is_active = true`) are shown in the app.
_Avoid_: Competition, tournament (for league-style competitions — use "league")

**Season**:
A single edition of a league (e.g. "2026-27 NBA"). Standings, rosters, and stats are always season-scoped. Exactly one season per league is `is_current = true` at any time.
_Avoid_: Year, campaign

**Standing**:
A team's win-loss record and ranking within a season, stored per `(season_id, team_id)`. Provided by the data provider; not computed from game results (tie-breaker rules are league-specific).
_Avoid_: Record, table entry

### Teams & Players

**Roster**:
The set of players on a team for a given season, represented by `team_season` membership and `player.team_id`.
_Avoid_: Squad, lineup

**Free Agent**:
A player whose `team_id` is null — not currently assigned to any team in the system. Displayed as "Free Agent" in the UI. Full historical stats remain accessible.
_Avoid_: Unsigned, unattached

**Season Averages**:
Per-player stats aggregated across all games in a season (PPG, RPG, APG, FG%, etc.). Computed on read from `PlayerGameStat` rows; not stored.
_Avoid_: Career averages (season-scoped only in MVP), stats (too vague)

**Canonical Entity**:
The authoritative row for a team or player when a provider has issued multiple IDs for the same real-world entity. Non-canonical rows carry a `canonical_id` pointing to the canonical one. All queries filter to `canonical_id IS NULL`.
_Avoid_: Primary, master record

### Devices & Favorites

**Device**:
A specific app installation, identified by its push token. One device row per physical installation. The device row follows the push token — if a token migrates (reinstall), the row's `device_id` is updated in place.
_Avoid_: User, account, installation

**Favorite**:
A team or league that a device is following. Stored both on-device (for UI ordering) and server-side (for notification routing only). Entity type is either `team` or `league`.
_Avoid_: Follow, subscription, bookmark (use "favorite" as the noun; "follow"/"unfollow" are fine as verbs)

**Follow / Unfollow**:
The action of adding or removing a favorite. The server copy is updated via a full-replace `PUT` after any local change.

### Ingestion

**Provider**:
The external data API that supplies basketball data (e.g. Highlightly, API-Sports). The mobile app never contacts the provider directly — only the ingestion worker does.
_Avoid_: Data source, feed

**Provider Ref**:
The provider's internal ID for an entity (team, player, game, etc.). Stored alongside Hooply's UUID so entities can be looked up and updated on each ingestion poll.
_Avoid_: External ID, source ID (use "provider ref")

**Normalization**:
The ingestion worker's process of translating a provider's response schema into Hooply's canonical data model. All provider-specific logic lives here — nothing outside the worker sees provider schemas.
_Avoid_: Mapping, transformation (use "normalization" for this step)

**Change Event**:
An in-process signal emitted by the ingestion worker when significant game state changes are detected: `game_started`, `game_finished`, `game_postponed`. Used to route push notifications. Score-change events exist in the model but are not used for notifications in MVP.
_Avoid_: Webhook, message, notification trigger
