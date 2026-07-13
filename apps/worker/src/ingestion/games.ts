import { db, game, league, season } from "@hooply/db";
import { and, eq, inArray } from "drizzle-orm";
import { detectChangeEvent, emitChangeEvent } from "../events";
import { normalizeGame, normalizeTeamStub } from "../normalize/game";
import type { NormalizedGame, NormalizedGameStatus } from "../normalize/game";
import { fetchGamesByDate } from "../providers/api-sports/client";
import type { ApiSportsGame } from "../providers/api-sports/types";
import { CURATED_LEAGUES } from "./curated-leagues";
import { upsertTeamStub } from "./teams";

export type CuratedLeagueSeasons = {
  leagueIdByProviderRef: Map<string, string>;
  currentSeasonIdByLeagueId: Map<string, string>;
};

// Shared by the slow date-range sync (#14, every 5min) and the fast live
// poll (#16, every 15s) — both need the same "which of our leagues/current
// seasons exist" lookup before they can resolve a raw provider game to a
// leagueId/seasonId pair.
export async function resolveCuratedLeagueSeasons(): Promise<CuratedLeagueSeasons> {
  const curatedRefs = CURATED_LEAGUES.map((c) => c.providerRef);

  const leagueRows = await db
    .select({ id: league.id, providerRef: league.providerRef })
    .from(league)
    .where(inArray(league.providerRef, curatedRefs));

  const leagueIdByProviderRef = new Map(leagueRows.map((l) => [l.providerRef, l.id]));

  const seasonRows =
    leagueRows.length === 0
      ? []
      : await db
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

  return { leagueIdByProviderRef, currentSeasonIdByLeagueId };
}

export async function ingestGames(apiKey: string, date: string): Promise<void> {
  const { leagueIdByProviderRef, currentSeasonIdByLeagueId } = await resolveCuratedLeagueSeasons();
  if (leagueIdByProviderRef.size === 0) return;

  const rawGames = await fetchGamesByDate(date, apiKey);

  for (const raw of rawGames) {
    const leagueId = leagueIdByProviderRef.get(String(raw.league.id));
    if (!leagueId) continue; // not one of our curated leagues

    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    if (!seasonId) continue; // league ingested but current season not seeded yet

    emitChangeEventIfAny(await upsertGame(raw, leagueId, seasonId));
  }
}

export type GameSyncResult = {
  gameId: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  previousStatus: NormalizedGameStatus | null;
  normalized: NormalizedGame;
};

// Shared by both ingestion cadences (see resolveCuratedLeagueSeasons above).
// Returns the pre-write status alongside the synced row so callers can
// detect transitions (change events, live Redis membership) without a
// second read — Postgres upsert RETURNING only gives the new row. Callers
// decide what to do with a transition (emitChangeEventIfAny here; live
// Redis membership in ingestion/live-games.ts) — this function's only job
// is the upsert plus the diff info needed to act on it.
export async function upsertGame(
  raw: ApiSportsGame,
  leagueId: string,
  seasonId: string,
): Promise<GameSyncResult> {
  const normalized = normalizeGame(raw);

  const [homeTeamId, awayTeamId] = await Promise.all([
    upsertTeamStub(normalizeTeamStub(raw.teams.home)),
    upsertTeamStub(normalizeTeamStub(raw.teams.away)),
  ]);

  const [existing] = await db
    .select({ status: game.status })
    .from(game)
    .where(
      and(eq(game.provider, normalized.provider), eq(game.providerRef, normalized.providerRef)),
    );
  const previousStatus = existing?.status ?? null;

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

  const [row] = await db
    .insert(game)
    .values(gameValues)
    .onConflictDoUpdate({ target: [game.provider, game.providerRef], set: gameValues })
    .returning({ id: game.id });
  if (!row) {
    throw new Error(`Failed to upsert game ${normalized.providerRef}`);
  }

  return { gameId: row.id, leagueId, homeTeamId, awayTeamId, previousStatus, normalized };
}

// Shared by both ingestion cadences — a transition can be observed by
// whichever one polls first, so both call this after every upsertGame
// rather than only the fast live job (see docs/data-model.md's "Change
// events" section, which isn't scoped to a particular cadence).
export function emitChangeEventIfAny(result: GameSyncResult): void {
  const changeEvent = detectChangeEvent(result.previousStatus, result.normalized.status);
  if (!changeEvent) return;

  emitChangeEvent({
    type: changeEvent,
    gameId: result.gameId,
    homeTeamId: result.homeTeamId,
    awayTeamId: result.awayTeamId,
    homeScore: result.normalized.homeScore,
    awayScore: result.normalized.awayScore,
    status: result.normalized.status,
  });
}
