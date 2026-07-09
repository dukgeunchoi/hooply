# Hooply — Data Provider Decision

Status: **Decided — API-Sports (API-Basketball)** · Date: 2026-07-09
Relates to: Phase 0 (issue #1) — "Confirm the data provider"; spike in issue #12

Pricing/limits below were checked 2026-07-06 and change often — re-verify on the provider dashboards before subscribing.

## Candidates

### Highlightly (Basketball API)

- Coverage: 340+ leagues, 50+ countries — NBA, EuroLeague, ACB, BBL, LNB, Lega A, NBL, B.League, CBA, KBL, FIBA comps, women's leagues
- Live data: quarter-by-quarter scores, OT tracking, game clock; standings; team data/logos; H2H; last-5; odds; video highlights (unique to them)
- Pricing (per day): **free 100 req** (no rate limit, includes live scores + standings) · **$6.99 → 7,500 req** (12 rps) · **$16.99 → 25,000** · **$39.99 → 60,000**
- Note: their NBA-specific API (separate product, from $7.99) adds player stats, box scores, lineups, NCAAB

### API-Sports (API-Basketball)

- Coverage: ~400 leagues incl. NBA + international; live updates ~every 15s
- Pricing (per API-NBA, Basketball API is priced separately but similarly): **free 100 req/day** · **Pro $15/mo** · **Ultra $25 → 75,000/day** · **Mega $35 → 150,000/day**. No feature gating on paid plans; prepaid, no auto-renewal, no overages (requests just stop)
- Caveat: NBA and international basketball are **separate subscriptions** (API-NBA vs API-Basketball)

### Ruled out for MVP

- **BALLDONTLIE** — great NBA depth (play-by-play, injuries), but box scores/standings/odds need the $39.99 GOAT tier, per sport; 20+ leagues but priced per league
- **SportsDataIO / Sportradar** — enterprise, ~$500–1,000+/mo, sales cycle. Path-to-scale options, not MVP

## Request budget (does a cheap tier suffice?)

Ingestion polls **games-by-date** (one call returns all live games) every 15s during live windows, plus slower metadata syncs:

```
live polling:    4 req/min × ~6 live hours/day   ≈ 1,440 req/day
standings sync:  active leagues × few times/day  ≈    50
schedule/rosters/players daily sync              ≈   200
                                          total  ≈ 1,700 req/day
```

- Free tiers (100/day): enough for **development against cached fixtures**, not for live operation
- Highlightly $6.99 (7,500/day): fits with 4× headroom — even ×2 if we poll boxscores per live game too
- API-Basketball Pro ($15): also fits; but NBA player depth may need API-NBA as a second subscription

## Spike findings (2026-07-09)

Spike scripts: `apps/worker/spikes/api-sports.ts` and `apps/worker/spikes/highlightly.ts` (run with `npx tsx apps/worker/spikes/<name>.ts`, both hit live free-tier endpoints with real keys). Raw output captured below per question.

### 1. Non-NBA player box scores

| | API-Sports | Highlightly |
|---|---|---|
| EuroLeague quarter scores (finished game) | ✅ (`scores.home.quarter_1..4`) | ✅ (`state.score.q1..4`) |
| Clock field exists on the schema | ✅ `status.timer` — `null` on finished games, populated on live games (see Q2) | ✅ `state.clock` — same pattern |
| EuroLeague per-player stat lines | ✅ 21 player rows: minutes, FG/3PT/FT splits, rebounds, assists, points | ❌ no per-player endpoint exists anywhere in the API |
| EuroLeague team-level stats | n/a (player-level covers it) | ❌ empty for the match tested (`statistics: []` both teams) |
| ACB quarter scores (finished game) | ✅ | ✅ |
| ACB per-player stat lines | ✅ 23 player rows, same shape as EuroLeague | ❌ same — no per-player endpoint |
| ACB team-level stats | n/a | ✅ populated (FG/3PT/FT, rebounds, steals, blocks, turnovers, fouls) — inconsistent with the EuroLeague match above |

API-Sports: per-player endpoint is `GET /games/statistics/players?id={gameId}` (singular `id`, not `ids` — the free plan blocks the plural multi-game `ids` param but the single-game `id` param works fine and returns full per-player lines for both EuroLeague and ACB). Player lines do **not** include steals/blocks/turnovers (team-level does); points/rebounds/assists/minutes/shooting splits are present, which covers the MVP Box Score tab.

Highlightly: confirmed via their own docs (`Basketball.Statistics` = "Get match statistics by match id") that the only statistics endpoint is team-level, and it doesn't exist for players at all — not for EuroLeague/ACB, not for NBA either. This isn't a non-NBA coverage gap, it's a product gap across their whole basketball API.

### 2. Live update latency

NBA is off-season on 2026-07-09, so no live NBA game existed to test against directly on either provider. Both scripts fell back to whatever league had a live game at run time and polled it 4x, 15s apart:

- **API-Sports** — NBL1 West (Australia): `timer` field advanced 5→5→6→6 across ~46s of polling (one tick roughly every ~20-25s at this cadence) while score stayed flat (low-scoring stretch). Consistent with "updates roughly every 15s," not faster.
- **Highlightly** — VBA (Vietnam): score moved 2-4 → 2-4 → 2-4 → 6-7 across ~46s (last poll picked up 2 baskets at once); the `clock` field stayed at `2` for all 4 polls despite the score changing, suggesting `clock` updates coarser-grained (whole minutes?) than the score itself.

Neither run had a live NBA game to confirm the advertised "~15s" figure against broadcast directly — re-run during NBA regular season (Oct–Jun) for a real read against a TV feed. Both providers' polling behavior looked plausible at 15s intervals; nothing here rules out either.

### 3. provider_ref stability

| | API-Sports | Highlightly |
|---|---|---|
| Team ID stable across seasons | ✅ Alba Berlin `id 519` present in both 2023 and 2024 EuroLeague seasons | ✅ Monaco `id 14400` present in both 2023 and 2024 EuroLeague seasons |
| Player ID stable across seasons | ✅ player `id 2547` resolves via `/players?id&season&team` in both 2023 and 2024 | N/A — no player entities exist in the API at all |

Both providers keep team refs stable across seasons — safe assumption for `canonical_id` dedup either way. API-Sports also keeps player refs stable; Highlightly has no player refs to test.

### Play-by-play (gates issue #24)

API-Sports/API-Basketball has no play-by-play or events endpoint (confirmed against the full endpoint list: Games, Games Statistics Teams/Players, Standings, Teams, Players, Leagues/Seasons, Countries, Odds — no events/plays route). Issue #24 is gated on a capability the chosen provider doesn't have.

## Recommendation — decided

**API-Sports (API-Basketball)**, not Highlightly. Highlightly has no per-player statistics endpoint anywhere in its basketball API — this isn't a non-NBA gap to work around, it can't power the Player pages / Box Score tab for *any* league, including NBA. That's disqualifying regardless of price. API-Sports has real per-player box scores (points/rebounds/assists/shooting splits/minutes) for EuroLeague and ACB on the free tier, using the game-scoped `id` param (the multi-game `ids` param is free-tier-blocked, but that's not how ingestion would poll per-game data anyway).

Pricing per the table above: **Pro $15/mo**. The spike ran entirely against API-Basketball (`v1.basketball.api-sports.io`), which already covers NBA (league id 12) in the same product, so a single subscription looks sufficient — this narrows the earlier "separate NBA/international subscriptions" caveat, though it's worth a final check on the paid-tier dashboard before committing.

The ingestion worker still keeps all provider-specific parsing behind the normalization layer (see docs/data-model.md), so this stays reversible if API-Sports' paid-tier behavior diverges from the free tier.
