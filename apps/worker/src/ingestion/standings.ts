import { db, league, season, standing } from "@hooply/db";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeStandings } from "../normalize/standing";
import { fetchStandings } from "../providers/api-sports/client";
import { CURATED_LEAGUES } from "./curated-leagues";
import { upsertTeamStub } from "./teams";

export async function ingestStandings(apiKey: string): Promise<void> {
  const curatedRefs = CURATED_LEAGUES.map((c) => c.providerRef);

  const leagueRows = await db
    .select({ id: league.id, providerRef: league.providerRef })
    .from(league)
    .where(inArray(league.providerRef, curatedRefs));

  for (const leagueRow of leagueRows) {
    const [currentSeason] = await db
      .select({ id: season.id, providerRef: season.providerRef })
      .from(season)
      .where(and(eq(season.leagueId, leagueRow.id), eq(season.isCurrent, true)));
    if (!currentSeason?.providerRef) continue; // current season not seeded yet

    const raw = await fetchStandings(leagueRow.providerRef, currentSeason.providerRef, apiKey);
    const normalized = normalizeStandings(raw);

    for (const row of normalized) {
      const teamId = await upsertTeamStub(row.team);

      const standingValues = {
        seasonId: currentSeason.id,
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
