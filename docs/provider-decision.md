# Hooply — Data Provider Decision

Status: Draft — final decision pending Phase 0 spike · Date: 2026-07-06
Relates to: Phase 0 (issue #1) — "Confirm the data provider"

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

## The open question the spike must answer

**Player box scores for non-NBA leagues.** Hooply's screens (Player pages, Box Score tab) assume per-player stat lines. Both providers clearly have them for NBA; coverage for EuroLeague/ACB/etc. is unverified. Phase 0 spike (one day, both free tiers):

1. Pull a finished EuroLeague + ACB game from each: do per-player stat lines exist? Quarter scores? Clock?
2. Pull a live NBA game: measure actual update latency vs broadcast
3. Check entity ID stability (same team id across seasons?) — matters for `provider_ref`

## Recommendation (pending spike)

Start with **Highlightly** ($6.99 tier at launch): cheaper entry, one subscription covers NBA + international, strong quarter-level live data, and highlights are a possible differentiator later. Fall back to **API-Sports** if the spike shows Highlightly's player-stat coverage is weaker — its pricing is equally indie-friendly.

If *neither* has non-NBA player box scores: ship MVP with **full player stats for NBA only**, team-level stats elsewhere, and note it in the app. Don't let a data gap block launch.

Either way the ingestion worker keeps all provider-specific parsing behind the normalization layer (see docs/data-model.md), so this decision stays reversible.
