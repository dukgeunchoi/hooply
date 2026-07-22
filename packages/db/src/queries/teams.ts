import type { Game, RosterPlayer, TeamProfile } from "@hooply/shared";
import { UUID_RE } from "@hooply/shared";
import { and, asc, desc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import { game, league, player, season, standing, team } from "../schema/index";
import { type GameRow, serializeGameRow } from "./games";

const homeTeam = alias(team, "team_games_home_team");
const awayTeam = alias(team, "team_games_away_team");

// GET /v1/teams/{id} — profile + current-season record/standing summary.
// `league`/`standing` are null until standings ingestion (#15) has written a
// row for this team's current season — not an error, matches the
// empty-array-instead-of-error pattern GET /v1/leagues/{id}/standings uses
// when no current season is seeded yet.
export async function getTeamById(rawId: string): Promise<TeamProfile | null> {
  if (!UUID_RE.test(rawId)) return null;

  const [teamRow] = await db
    .select({
      id: team.id,
      name: team.name,
      code: team.code,
      logoUrl: team.logoUrl,
      country: team.country,
    })
    .from(team)
    .where(and(eq(team.id, rawId), isNull(team.canonicalId)));
  if (!teamRow) return null;

  const [standingRow] = await db
    .select({
      rank: standing.rank,
      wins: standing.wins,
      losses: standing.losses,
      conference: standing.conference,
      groupName: standing.groupName,
      leagueId: league.id,
      leagueName: league.name,
    })
    .from(standing)
    .innerJoin(season, eq(standing.seasonId, season.id))
    .innerJoin(league, eq(season.leagueId, league.id))
    .where(and(eq(standing.teamId, rawId), eq(season.isCurrent, true)));

  return {
    id: teamRow.id,
    name: teamRow.name,
    code: teamRow.code,
    logo_url: teamRow.logoUrl,
    country: teamRow.country,
    league: standingRow ? { id: standingRow.leagueId, name: standingRow.leagueName } : null,
    standing: standingRow
      ? {
          rank: standingRow.rank,
          conference: standingRow.conference,
          group_name: standingRow.groupName,
          wins: standingRow.wins,
          losses: standingRow.losses,
        }
      : null,
  };
}

export type TeamGamesWindow = "upcoming" | "past";

// GET /v1/teams/{id}/games?window=upcoming|past&limit= — reuses
// serializeGameRow from queries/games.ts (same `Game` shape the Scores/
// League Hub screens already render). "upcoming"/"past" split on tipoff
// time rather than status: a game that's tipped off but still live belongs
// in "past" (today's recent-results bucket), matching how a scoreboard app
// actually groups games, not the game's lifecycle phase.
export async function getTeamGames(
  rawId: string,
  window: TeamGamesWindow,
  limit: number,
  now: Date = new Date(),
): Promise<Game[] | null> {
  if (!UUID_RE.test(rawId)) return null;

  const [teamRow] = await db
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.id, rawId), isNull(team.canonicalId)));
  if (!teamRow) return null;

  const rows: GameRow[] = await db
    .select({
      gameId: game.id,
      status: game.status,
      tipoffAt: game.tipoffAt,
      period: game.period,
      clock: game.clock,
      venue: game.venue,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamId: homeTeam.id,
      homeTeamName: homeTeam.name,
      homeTeamCode: homeTeam.code,
      homeTeamLogoUrl: homeTeam.logoUrl,
      awayTeamId: awayTeam.id,
      awayTeamName: awayTeam.name,
      awayTeamCode: awayTeam.code,
      awayTeamLogoUrl: awayTeam.logoUrl,
    })
    .from(game)
    .innerJoin(homeTeam, eq(game.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(game.awayTeamId, awayTeam.id))
    .where(
      and(
        or(eq(game.homeTeamId, rawId), eq(game.awayTeamId, rawId)),
        window === "upcoming" ? gte(game.tipoffAt, now) : lt(game.tipoffAt, now),
      ),
    )
    .orderBy(window === "upcoming" ? asc(game.tipoffAt) : desc(game.tipoffAt))
    .limit(limit);

  return rows.map(serializeGameRow);
}

// GET /v1/teams/{id}/roster?season= — flat, sorted by position then jersey
// number (the mobile Roster tab groups by position client-side). Takes no
// season param: team_season (docs/data-model.md) is never populated by any
// ingestion job, so player.team_id is the only roster source there is, and
// it always reflects the current team only. The route still validates
// `season`'s shape for API-contract honesty; it just never reaches here.
export async function getTeamRoster(rawId: string): Promise<RosterPlayer[] | null> {
  if (!UUID_RE.test(rawId)) return null;

  const [teamRow] = await db
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.id, rawId), isNull(team.canonicalId)));
  if (!teamRow) return null;

  const rows = await db
    .select({
      id: player.id,
      fullName: player.fullName,
      position: player.position,
      jerseyNumber: player.jerseyNumber,
    })
    .from(player)
    .where(and(eq(player.teamId, rawId), isNull(player.canonicalId)))
    .orderBy(asc(player.position), asc(player.jerseyNumber));

  return rows.map((r) => ({
    id: r.id,
    full_name: r.fullName,
    position: r.position,
    jersey_number: r.jerseyNumber,
  }));
}
