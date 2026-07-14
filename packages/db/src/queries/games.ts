import type { Game, GameDetail, GameStatus, LeagueGames } from "@hooply/shared";
import { LIVE_STALE_THRESHOLD_MS, UUID_RE, isStale } from "@hooply/shared";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import { game, league, team } from "../schema/index";

const homeTeam = alias(team, "home_team");
const awayTeam = alias(team, "away_team");

type GameRow = {
  gameId: string;
  status: GameStatus;
  tipoffAt: Date;
  period: number | null;
  clock: string | null;
  venue: string | null;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamCode: string | null;
  homeTeamLogoUrl: string | null;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamCode: string | null;
  awayTeamLogoUrl: string | null;
};

function serializeGameRow(r: GameRow): Game {
  return {
    id: r.gameId,
    status: r.status,
    tipoff_at: r.tipoffAt.toISOString(),
    period: r.period,
    clock: r.clock,
    venue: r.venue,
    home: {
      team: {
        id: r.homeTeamId,
        name: r.homeTeamName,
        code: r.homeTeamCode,
        logo_url: r.homeTeamLogoUrl,
      },
      score: r.homeScore,
    },
    away: {
      team: {
        id: r.awayTeamId,
        name: r.awayTeamName,
        code: r.awayTeamCode,
        logo_url: r.awayTeamLogoUrl,
      },
      score: r.awayScore,
    },
  };
}

// Only `live` rows can make a games response stale (see docs/api-spec.md) —
// scheduled/final/etc. don't tick between polls.
function isDelayed(rows: { status: string; updatedAt: Date }[], now: Date): boolean {
  const liveUpdatedAts = rows.filter((r) => r.status === "live").map((r) => r.updatedAt);
  return isStale(liveUpdatedAts, now, LIVE_STALE_THRESHOLD_MS);
}

export async function getGamesForDate(
  date: string,
): Promise<{ leagues: LeagueGames[]; delayed: boolean }> {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      gameId: game.id,
      status: game.status,
      tipoffAt: game.tipoffAt,
      period: game.period,
      clock: game.clock,
      venue: game.venue,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      updatedAt: game.updatedAt,
      leagueId: league.id,
      leagueName: league.name,
      leaguePriority: league.priority,
      leagueLogoUrl: league.logoUrl,
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
    .innerJoin(league, eq(game.leagueId, league.id))
    .innerJoin(homeTeam, eq(game.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(game.awayTeamId, awayTeam.id))
    .where(and(gte(game.tipoffAt, dayStart), lt(game.tipoffAt, dayEnd)))
    .orderBy(asc(league.priority), asc(game.tipoffAt));

  const groups = new Map<string, LeagueGames>();
  for (const r of rows) {
    let group = groups.get(r.leagueId);
    if (!group) {
      group = {
        league: { id: r.leagueId, name: r.leagueName, logo_url: r.leagueLogoUrl },
        games: [],
      };
      groups.set(r.leagueId, group);
    }
    group.games.push(serializeGameRow(r));
  }

  return { leagues: Array.from(groups.values()), delayed: isDelayed(rows, new Date()) };
}

export async function getGamesForLeagueRange(
  leagueId: string,
  from: string,
  to: string,
): Promise<{ games: Game[]; delayed: boolean }> {
  const rangeStart = new Date(`${from}T00:00:00.000Z`);
  const rangeEnd = new Date(`${to}T00:00:00.000Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // `to` is inclusive of that whole day

  const rows = await db
    .select({
      gameId: game.id,
      status: game.status,
      tipoffAt: game.tipoffAt,
      period: game.period,
      clock: game.clock,
      venue: game.venue,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      updatedAt: game.updatedAt,
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
      and(eq(game.leagueId, leagueId), gte(game.tipoffAt, rangeStart), lt(game.tipoffAt, rangeEnd)),
    )
    .orderBy(asc(game.tipoffAt));

  return { games: rows.map(serializeGameRow), delayed: isDelayed(rows, new Date()) };
}

// Defensive against a malformed path-param id: a non-uuid literal would
// otherwise make Postgres throw, turning a would-be 404 into a 500 (mirrors
// getLeagueById in queries/leagues.ts).
export async function getGameById(
  rawId: string,
): Promise<{ game: GameDetail; delayed: boolean } | null> {
  if (!UUID_RE.test(rawId)) return null;

  const [row] = await db
    .select({
      gameId: game.id,
      status: game.status,
      tipoffAt: game.tipoffAt,
      period: game.period,
      clock: game.clock,
      venue: game.venue,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      periodScores: game.periodScores,
      updatedAt: game.updatedAt,
      leagueId: league.id,
      leagueName: league.name,
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
    .innerJoin(league, eq(game.leagueId, league.id))
    .innerJoin(homeTeam, eq(game.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(game.awayTeamId, awayTeam.id))
    .where(eq(game.id, rawId));

  if (!row) return null;

  const detail: GameDetail = {
    id: row.gameId,
    status: row.status,
    tipoff_at: row.tipoffAt.toISOString(),
    period: row.period,
    clock: row.clock,
    venue: row.venue,
    league: { id: row.leagueId, name: row.leagueName },
    home: {
      team: {
        id: row.homeTeamId,
        name: row.homeTeamName,
        code: row.homeTeamCode,
        logo_url: row.homeTeamLogoUrl,
      },
      score: row.homeScore,
      period_scores: row.periodScores?.home ?? [],
    },
    away: {
      team: {
        id: row.awayTeamId,
        name: row.awayTeamName,
        code: row.awayTeamCode,
        logo_url: row.awayTeamLogoUrl,
      },
      score: row.awayScore,
      period_scores: row.periodScores?.away ?? [],
    },
  };

  const delayed =
    row.status === "live" && isStale([row.updatedAt], new Date(), LIVE_STALE_THRESHOLD_MS);

  return { game: detail, delayed };
}
