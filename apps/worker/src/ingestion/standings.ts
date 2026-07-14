import { db, standing } from "@hooply/db";
import { normalizeStandings } from "../normalize/standing";
import { fetchStandings } from "../providers/api-sports/client";
import type { GameStore } from "./sync-game";
import { drizzleGameStore, resolveCuratedLeagueSeasons } from "./sync-game";
import { upsertTeamStub } from "./teams";

export async function ingestStandings(
  apiKey: string,
  store: Pick<GameStore, "findLeagueSeasons"> = drizzleGameStore,
): Promise<void> {
  const {
    leagueIdByProviderRef,
    currentSeasonIdByLeagueId,
    leagueProviderRefById,
    currentSeasonProviderRefByLeagueId,
  } = await resolveCuratedLeagueSeasons(store);

  for (const leagueId of leagueIdByProviderRef.values()) {
    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    const seasonProviderRef = currentSeasonProviderRefByLeagueId.get(leagueId);
    const leagueProviderRef = leagueProviderRefById.get(leagueId);
    if (!seasonId || !seasonProviderRef || !leagueProviderRef) continue; // current season not seeded yet

    const raw = await fetchStandings(leagueProviderRef, seasonProviderRef, apiKey);
    const normalized = normalizeStandings(raw);

    for (const row of normalized) {
      const teamId = await upsertTeamStub(row.team);

      const standingValues = {
        seasonId,
        teamId,
        rank: row.rank,
        played: row.played,
        wins: row.wins,
        losses: row.losses,
        winPct: row.winPct,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        streak: row.streak,
        gamesBehind: row.gamesBehind,
        conference: row.conference,
        groupName: row.groupName,
        updatedAt: new Date(),
      };

      await db
        .insert(standing)
        .values(standingValues)
        .onConflictDoUpdate({ target: [standing.seasonId, standing.teamId], set: standingValues });
    }
  }
}
