import { db, game, player, team } from "@hooply/db";
import { and, eq, ilike, inArray, isNull } from "drizzle-orm";
import type { NormalizedPlayerStub } from "../normalize/boxscore";
import {
  type CanonicalCandidate,
  type NormalizedPlayer,
  detectCanonicalDuplicate,
  normalizePlayer,
} from "../normalize/player";
import { fetchPlayers } from "../providers/api-sports/client";
import { drizzleGameStore, resolveCuratedLeagueSeasons } from "./sync-game";

// Box score ingestion runs before any dedicated player-ingestion phase
// exists (mirrors upsertTeamStub's role for teams pre-#20, see
// normalize/game.ts) — keeps player.team_id current so later features
// (roster, player page) have something to build on, but never touches
// jersey/position/photo, which dedicated player ingestion will own once it
// exists.
export async function upsertPlayerStub(
  stub: NormalizedPlayerStub,
  teamId: string,
): Promise<string> {
  const values = { ...stub, teamId };
  const [row] = await db
    .insert(player)
    .values(values)
    .onConflictDoUpdate({ target: [player.provider, player.providerRef], set: values })
    .returning({ id: player.id });
  if (!row) {
    throw new Error(`Failed to upsert player ${stub.fullName}`);
  }
  return row.id;
}

// Teams that appear in a given league/season's games — the only source of
// "which teams belong to this league's current season" available, since
// team_season (docs/data-model.md) is never populated by any ingestion job.
// Games ingestion (#14, this issue's blocker) already ties every team to a
// league+season through home_team_id/away_team_id, so that's reused here
// instead of standing (#15, not one of this issue's blockers, and might not
// have run yet).
async function findTeamsForSeason(
  leagueId: string,
  seasonId: string,
): Promise<{ id: string; providerRef: string }[]> {
  const gameRows = await db
    .select({ homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId })
    .from(game)
    .where(and(eq(game.leagueId, leagueId), eq(game.seasonId, seasonId)));

  const teamIds = new Set<string>();
  for (const row of gameRows) {
    teamIds.add(row.homeTeamId);
    teamIds.add(row.awayTeamId);
  }
  if (teamIds.size === 0) return [];

  return db
    .select({ id: team.id, providerRef: team.providerRef })
    .from(team)
    .where(inArray(team.id, Array.from(teamIds)));
}

// Prefilter for detectCanonicalDuplicate: only canonical rows (never an
// already-retired alias) are dedup targets, per ADR-0003. The case-
// insensitive equality match narrows the candidate set; the pure function
// makes the final (country-aware) call.
async function findCanonicalCandidates(fullName: string): Promise<CanonicalCandidate[]> {
  return db
    .select({ id: player.id, fullName: player.fullName, country: player.country })
    .from(player)
    .where(
      and(
        eq(player.provider, "api-sports"),
        isNull(player.canonicalId),
        ilike(player.fullName, fullName),
      ),
    );
}

async function upsertPlayer(normalized: NormalizedPlayer, teamId: string): Promise<void> {
  const existing = await db
    .select({ id: player.id })
    .from(player)
    .where(
      and(eq(player.provider, normalized.provider), eq(player.providerRef, normalized.providerRef)),
    );

  // Dedup detection only makes sense for a provider_ref we've never seen
  // before — an already-known row just gets its mutable fields refreshed,
  // never re-evaluated for canonical_id (which stays whatever a prior
  // ingestion run decided).
  let canonicalId: string | null = null;
  if (existing.length === 0) {
    const candidates = await findCanonicalCandidates(normalized.fullName);
    canonicalId = detectCanonicalDuplicate(normalized, candidates);
  }

  const values = {
    provider: normalized.provider,
    providerRef: normalized.providerRef,
    teamId,
    fullName: normalized.fullName,
    position: normalized.position,
    jerseyNumber: normalized.jerseyNumber,
    country: normalized.country,
    ...(canonicalId ? { canonicalId } : {}),
  };

  await db
    .insert(player)
    .values(values)
    .onConflictDoUpdate({ target: [player.provider, player.providerRef], set: values });
}

// Runs alongside standings on the slower metadata cadence (issue #20 —
// rosters don't change mid-game). Curated leagues -> current season -> every
// team seen in that season's games -> that team's full roster.
export async function ingestPlayers(apiKey: string): Promise<void> {
  const { leagueIdByProviderRef, currentSeasonIdByLeagueId, currentSeasonProviderRefByLeagueId } =
    await resolveCuratedLeagueSeasons(drizzleGameStore);

  for (const leagueId of leagueIdByProviderRef.values()) {
    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    const seasonProviderRef = currentSeasonProviderRefByLeagueId.get(leagueId);
    if (!seasonId || !seasonProviderRef) continue; // current season not seeded yet

    const teams = await findTeamsForSeason(leagueId, seasonId);
    for (const teamRow of teams) {
      const rawPlayers = await fetchPlayers(teamRow.providerRef, seasonProviderRef, apiKey);
      for (const raw of rawPlayers) {
        await upsertPlayer(normalizePlayer(raw), teamRow.id);
      }
    }
  }
}
