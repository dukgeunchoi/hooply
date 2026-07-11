import { db, game, league, season, team } from "@hooply/db";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeGame } from "../normalize/game";
import { fetchGamesByDate } from "../providers/api-sports/client";
import type { ApiSportsGame, ApiSportsGameTeam } from "../providers/api-sports/types";
import { CURATED_LEAGUES } from "./curated-leagues";

export async function ingestGames(apiKey: string, date: string): Promise<void> {
  const curatedRefs = CURATED_LEAGUES.map((c) => c.providerRef);

  const leagueRows = await db
    .select({ id: league.id, providerRef: league.providerRef })
    .from(league)
    .where(inArray(league.providerRef, curatedRefs));
  if (leagueRows.length === 0) return;

  const leagueIdByProviderRef = new Map(leagueRows.map((l) => [l.providerRef, l.id]));

  const seasonRows = await db
    .select({ id: season.id, leagueId: season.leagueId })
    .from(season)
    .where(
      and(
        inArray(
          season.leagueId,
          leagueRows.map((l) => l.id),
        ),
        eq(season.isCurrent, true),
      ),
    );
  const currentSeasonIdByLeagueId = new Map(seasonRows.map((s) => [s.leagueId, s.id]));

  const rawGames = await fetchGamesByDate(date, apiKey);

  for (const raw of rawGames) {
    const leagueId = leagueIdByProviderRef.get(String(raw.league.id));
    if (!leagueId) continue; // not one of our curated leagues

    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    if (!seasonId) continue; // league ingested but current season not seeded yet

    await upsertGame(raw, leagueId, seasonId);
  }
}

async function upsertGame(raw: ApiSportsGame, leagueId: string, seasonId: string): Promise<void> {
  const normalized = normalizeGame(raw);

  const [homeTeamId, awayTeamId] = await Promise.all([
    upsertTeamStub(raw.teams.home),
    upsertTeamStub(raw.teams.away),
  ]);

  const gameValues = {
    provider: normalized.provider,
    providerRef: normalized.providerRef,
    seasonId,
    leagueId,
    homeTeamId,
    awayTeamId,
    tipoffAt: new Date(normalized.tipoffAt),
    status: normalized.status,
    period: normalized.period,
    clock: normalized.clock,
    homeScore: normalized.homeScore,
    awayScore: normalized.awayScore,
    periodScores: normalized.periodScores,
    venue: normalized.venue,
    updatedAt: new Date(),
  };

  await db
    .insert(game)
    .values(gameValues)
    .onConflictDoUpdate({ target: [game.provider, game.providerRef], set: gameValues });
}

// Games ingestion runs before any dedicated team-ingestion phase exists
// (there's no issue for it before #20), so it seeds minimal team stub rows
// itself — just enough to satisfy game.home_team_id/away_team_id. Fields
// beyond name/logo (code, short_name, roster) are filled in later by team
// ingestion; this upsert never touches those columns, so it can't clobber them.
async function upsertTeamStub(raw: ApiSportsGameTeam): Promise<string> {
  const values = {
    provider: "api-sports" as const,
    providerRef: String(raw.id),
    name: raw.name,
    logoUrl: raw.logo,
  };
  const [row] = await db
    .insert(team)
    .values(values)
    .onConflictDoUpdate({ target: [team.provider, team.providerRef], set: values })
    .returning({ id: team.id });
  if (!row) {
    throw new Error(`Failed to upsert team ${raw.name}`);
  }
  return row.id;
}
