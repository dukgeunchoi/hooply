# Hooply — Canonical Data Model

Status: Draft for review · Date: 2026-07-06
Relates to: Phase 1 (issue #2) — "Define the canonical schema"

This is the provider-agnostic data model the ingestion worker normalizes into. Nothing outside the ingestion worker ever sees a provider's schema.

## Principles

1. **Provider-swappable.** Every synced entity carries `provider` + `provider_ref` (the provider's ID). Swapping providers means redoing the ingestion mapping only. A `jsonb external_ids` map allows multiple providers during a migration.
2. **Postgres is the source of truth; Redis is a cache.** Redis holds live game state for fast reads and change-detection diffs. It can be rebuilt from Postgres + the next poll at any time.
3. **Seasons are first-class.** Standings, rosters, and stats only make sense per season. Leagues persist across seasons.
4. **Store facts, compute views.** Standings are derived from games but stored (provider gives them, and tie-breaker rules are league-specific). Player season averages are computed from stat lines, cached if needed.

## Entities

```
League 1─* Season 1─* Game *─2 Team
Season 1─* Standing *─1 Team
Team 1─* Player (current roster; via team_season for history)
Game 1─* PlayerGameStat *─1 Player
Game 1─2 TeamGameStat
Device 1─* Favorite
```

### league
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| provider, provider_ref | text | unique together |
| external_ids | jsonb | for provider migrations |
| name | text | "NBA", "EuroLeague" |
| country | text nullable | null for multi-country comps |
| logo_url | text | |
| priority | int | sort order in app (NBA first) |
| is_active | bool | curated launch set = true |
| updated_at | timestamptz | last ingestion write; backs `meta.delayed` on `GET /v1/leagues` |

### season
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| league_id | FK league | |
| provider_ref | text | unique with `league_id` |
| label | text | "2026-27" |
| starts_on / ends_on | date | |
| is_current | bool | one per league |

### team
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| provider, provider_ref, external_ids | | as league |
| name | text | "Los Angeles Lakers" |
| short_name | text | "Lakers" |
| code | text | "LAL" |
| logo_url | text | |
| country | text | |

### team_season (roster/participation)
| column | type | notes |
|---|---|---|
| team_id / season_id | FK | PK (team_id, season_id) |
| conference | text nullable | "East"/"West" for NBA |
| group_name | text nullable | for group-stage comps |

### player
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| provider, provider_ref, external_ids | | |
| team_id | FK team nullable | current team; null = free agent/unknown |
| full_name | text | |
| position | text nullable | G/F/C etc. |
| jersey_number | int nullable | |
| height_cm / weight_kg | int nullable | |
| country | text nullable | |
| photo_url | text nullable | |

### game
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| provider, provider_ref, external_ids | | |
| season_id | FK season | |
| league_id | FK league | denormalized for cheap "games by league today" |
| home_team_id / away_team_id | FK team | |
| tipoff_at | timestamptz | |
| status | enum | scheduled, live, halftime, finished, postponed, cancelled |
| period | int nullable | 1–4, 5+ = OT number; null unless live |
| clock | text nullable | "07:42"; only while live |
| home_score / away_score | int | running total |
| period_scores | jsonb | `{"home":[28,25,...],"away":[30,22,...]}` — handles any number of OTs |
| venue | text nullable | |
| stats_synced_at | timestamptz nullable | last successful box-score sync |
| updated_at | timestamptz | staleness/"delayed" indicator |

### player_game_stat (box score line)
| column | type | notes |
|---|---|---|
| game_id / player_id | FK | PK (game_id, player_id) |
| team_id | FK team | |
| seconds_played | int | store seconds, render minutes |
| points, assists | int | |
| rebounds_off / rebounds_def | int | total = sum |
| steals, blocks, turnovers, fouls | int | |
| fg_made / fg_att | int | |
| three_made / three_att | int | |
| ft_made / ft_att | int | |
| plus_minus | int nullable | not all providers give it |
| is_starter | bool | |

### team_game_stat
Same stat columns as above aggregated per team, PK (game_id, team_id). Store even though it's summable — providers include team totals that don't always equal the player sum (team rebounds).

### standing
| column | type | notes |
|---|---|---|
| season_id / team_id | FK | PK (season_id, team_id) |
| rank | int | within conference/group if present |
| played, wins, losses | int | |
| win_pct | numeric | |
| points_for / points_against | int | |
| streak | text nullable | "W4" |
| games_behind | numeric nullable | NBA-style |
| conference / group_name | text nullable | mirrors team_season |
| updated_at | timestamptz | |

### device & favorite (no-login MVP)
```
device:   id uuid PK, push_token text unique nullable, platform enum(ios,android),
          locale text, created_at, last_seen_at
favorite: device_id FK, entity_type enum(team,league), entity_id uuid,
          created_at — PK (device_id, entity_type, entity_id)
```
Favorites also live on-device; server copy exists only to route notifications. Uninstall = favorites lost (accepted MVP limitation).

### play_by_play (optional, provider-dependent)
```
game_id FK, seq int, period int, clock text, event_type text,
team_id / player_id FK nullable, detail jsonb — PK (game_id, seq)
```
Ship only if the chosen provider includes it; the game screen must work without it.

## Indexes

- `game (league_id, tipoff_at)` — league schedule/results
- `game (status) WHERE status IN ('live','halftime')` — partial; the ingestion hot path
- `game (home_team_id, tipoff_at)` + `(away_team_id, tipoff_at)` — team pages
- `player (team_id)`; unique `(provider, provider_ref)` on every synced table
- `favorite (entity_type, entity_id)` — "who do we notify about this team"
- Full-text/trigram index on `team.name`, `player.full_name`, `league.name` for search (pg_trgm)

## Redis keys (cache, rebuildable)

```
live:game:{game_id}     → JSON snapshot of live game state   (TTL few hours)
live:league:{league_id} → set of live game_ids               (TTL few hours)
ingest:last:{game_id}   → last normalized payload hash, for diffing
```

## Change events (ingestion → notifications)

Emitted when the diff detects: `game_started`, `score_change` (with delta; notification service decides "meaningful"), `period_end`, `game_finished`, `game_postponed`. Payload: game_id, both team ids, scores, status. This is an in-process or Postgres LISTEN/NOTIFY event for MVP — a queue comes later (Path to Scale).

## Open questions

1. Injuries/lineups pre-game — provider-dependent; punt to post-MVP?
2. Historical seasons at launch — seed current season only, or 1–2 back for team pages?
3. Player season averages — compute on read (fine at MVP scale) vs materialized view. Start with on-read.
