import { db, game, league, season } from "@hooply/db";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeGame, normalizeTeamStub } from "../normalize/game";
import { fetchGamesByDate } from "../providers/api-sports/client";
import type { ApiSportsGame } from "../providers/api-sports/types";
import { CURATED_LEAGUES } from "./curated-leagues";
import { upsertTeamStub } from "./teams";

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
    upsertTeamStub(normalizeTeamStub(raw.teams.home)),
    upsertTeamStub(normalizeTeamStub(raw.teams.away)),
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
