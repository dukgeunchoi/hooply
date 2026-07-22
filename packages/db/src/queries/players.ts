import type { PlayerGameLogRow, PlayerProfile, SeasonAverages } from "@hooply/shared";
import { UUID_RE } from "@hooply/shared";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import { game, player, playerGameStat, season, team } from "../schema/index";

// GET /v1/players/{id}'s "current-season averages" — computed on read from
// PlayerGameStat per docs/data-model.md ("Season Averages": aggregated, not
// stored). Scoped by `season.is_current` rather than by resolving the
// player's team's league first: a player only ever plays in one league, so
// joining straight through game -> season and filtering is_current lands on
// exactly that league's current season without needing to know which one
// it is up front. Returns null (not a zeroed line) when the player hasn't
// logged a game yet this season — including every free agent.
async function computeSeasonAverages(playerId: string): Promise<SeasonAverages | null> {
  const rows = await db
    .select({
      secondsPlayed: playerGameStat.secondsPlayed,
      points: playerGameStat.points,
      reboundsOff: playerGameStat.reboundsOff,
      reboundsDef: playerGameStat.reboundsDef,
      assists: playerGameStat.assists,
      fgMade: playerGameStat.fgMade,
      fgAtt: playerGameStat.fgAtt,
      threeMade: playerGameStat.threeMade,
      threeAtt: playerGameStat.threeAtt,
      ftMade: playerGameStat.ftMade,
      ftAtt: playerGameStat.ftAtt,
    })
    .from(playerGameStat)
    .innerJoin(game, eq(playerGameStat.gameId, game.id))
    .innerJoin(season, eq(game.seasonId, season.id))
    .where(and(eq(playerGameStat.playerId, playerId), eq(season.isCurrent, true)));

  if (rows.length === 0) return null;

  const totals = rows.reduce(
    (acc, r) => ({
      secondsPlayed: acc.secondsPlayed + r.secondsPlayed,
      points: acc.points + r.points,
      rebounds: acc.rebounds + r.reboundsOff + r.reboundsDef,
      assists: acc.assists + r.assists,
      fgMade: acc.fgMade + r.fgMade,
      fgAtt: acc.fgAtt + r.fgAtt,
      threeMade: acc.threeMade + r.threeMade,
      threeAtt: acc.threeAtt + r.threeAtt,
      ftMade: acc.ftMade + r.ftMade,
      ftAtt: acc.ftAtt + r.ftAtt,
    }),
    {
      secondsPlayed: 0,
      points: 0,
      rebounds: 0,
      assists: 0,
      fgMade: 0,
      fgAtt: 0,
      threeMade: 0,
      threeAtt: 0,
      ftMade: 0,
      ftAtt: 0,
    },
  );

  const gamesPlayed = rows.length;
  return {
    games_played: gamesPlayed,
    ppg: totals.points / gamesPlayed,
    rpg: totals.rebounds / gamesPlayed,
    apg: totals.assists / gamesPlayed,
    mpg: totals.secondsPlayed / gamesPlayed / 60,
    fg_pct: totals.fgAtt === 0 ? null : totals.fgMade / totals.fgAtt,
    three_pct: totals.threeAtt === 0 ? null : totals.threeMade / totals.threeAtt,
    ft_pct: totals.ftAtt === 0 ? null : totals.ftMade / totals.ftAtt,
  };
}

export async function getPlayerById(rawId: string): Promise<PlayerProfile | null> {
  if (!UUID_RE.test(rawId)) return null;

  const [row] = await db
    .select({
      id: player.id,
      fullName: player.fullName,
      position: player.position,
      jerseyNumber: player.jerseyNumber,
      heightCm: player.heightCm,
      weightKg: player.weightKg,
      country: player.country,
      photoUrl: player.photoUrl,
      teamId: team.id,
      teamName: team.name,
      teamCode: team.code,
      teamLogoUrl: team.logoUrl,
    })
    .from(player)
    // ADR-0003: a merged/retired team row must never surface either, same
    // as the player row itself below.
    .leftJoin(team, and(eq(player.teamId, team.id), isNull(team.canonicalId)))
    .where(and(eq(player.id, rawId), isNull(player.canonicalId)));

  if (!row) return null;

  const seasonAverages = await computeSeasonAverages(row.id);

  return {
    id: row.id,
    full_name: row.fullName,
    position: row.position,
    jersey_number: row.jerseyNumber,
    height_cm: row.heightCm,
    weight_kg: row.weightKg,
    country: row.country,
    photo_url: row.photoUrl,
    // "Free Agent" (docs/screens.md) — team_id null.
    team:
      row.teamId !== null
        ? {
            id: row.teamId,
            name: row.teamName as string,
            code: row.teamCode,
            logo_url: row.teamLogoUrl,
          }
        : null,
    season_averages: seasonAverages,
  };
}

const PAGE_SIZE = 20;

const opponentHomeTeam = alias(team, "player_log_home_team");
const opponentAwayTeam = alias(team, "player_log_away_team");

export type PlayerGameLogPage = { rows: PlayerGameLogRow[]; nextCursor: string | null };

// GET /v1/players/{id}/stats?season=&cursor= — one row per game, newest
// first. `seasonId` defaults to whichever season is currently `is_current`
// (same default-to-current convention GET /v1/leagues/{id}/standings uses);
// an explicit `seasonId` overrides it. The cursor is the previous page's
// oldest `tipoff_at` (opaque to the client) — ties are theoretically
// possible (two games at the exact same instant) but not a real-world
// concern for a single player's schedule, so no secondary tiebreaker key is
// threaded through the cursor.
export async function getPlayerGameLog(
  rawId: string,
  opts: { seasonId?: string; cursor?: string } = {},
): Promise<PlayerGameLogPage | null> {
  if (!UUID_RE.test(rawId)) return null;

  const [playerRow] = await db
    .select({ id: player.id })
    .from(player)
    .where(and(eq(player.id, rawId), isNull(player.canonicalId)));
  if (!playerRow) return null;

  const conditions = [eq(playerGameStat.playerId, rawId)];
  conditions.push(opts.seasonId ? eq(game.seasonId, opts.seasonId) : eq(season.isCurrent, true));
  if (opts.cursor) {
    conditions.push(lt(game.tipoffAt, new Date(opts.cursor)));
  }

  const rows = await db
    .select({
      gameId: game.id,
      tipoffAt: game.tipoffAt,
      status: game.status,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      homeTeamName: opponentHomeTeam.name,
      homeTeamCode: opponentHomeTeam.code,
      homeTeamLogoUrl: opponentHomeTeam.logoUrl,
      awayTeamName: opponentAwayTeam.name,
      awayTeamCode: opponentAwayTeam.code,
      awayTeamLogoUrl: opponentAwayTeam.logoUrl,
      playerTeamId: playerGameStat.teamId,
      secondsPlayed: playerGameStat.secondsPlayed,
      points: playerGameStat.points,
      reboundsOff: playerGameStat.reboundsOff,
      reboundsDef: playerGameStat.reboundsDef,
      assists: playerGameStat.assists,
    })
    .from(playerGameStat)
    .innerJoin(game, eq(playerGameStat.gameId, game.id))
    .innerJoin(season, eq(game.seasonId, season.id))
    .innerJoin(opponentHomeTeam, eq(game.homeTeamId, opponentHomeTeam.id))
    .innerJoin(opponentAwayTeam, eq(game.awayTeamId, opponentAwayTeam.id))
    .where(and(...conditions))
    .orderBy(desc(game.tipoffAt))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;
  const lastRow = page[page.length - 1];
  const nextCursor = hasMore && lastRow ? lastRow.tipoffAt.toISOString() : null;

  const logRows: PlayerGameLogRow[] = page.map((r) => {
    const isHome = r.playerTeamId === r.homeTeamId;
    const opponent = isHome
      ? {
          id: r.awayTeamId,
          name: r.awayTeamName,
          code: r.awayTeamCode,
          logo_url: r.awayTeamLogoUrl,
        }
      : {
          id: r.homeTeamId,
          name: r.homeTeamName,
          code: r.homeTeamCode,
          logo_url: r.homeTeamLogoUrl,
        };
    const ownScore = isHome ? r.homeScore : r.awayScore;
    const opponentScore = isHome ? r.awayScore : r.homeScore;
    const result: "W" | "L" | null =
      r.status === "final" ? (ownScore > opponentScore ? "W" : "L") : null;

    return {
      game: { id: r.gameId, tipoff_at: r.tipoffAt.toISOString(), status: r.status },
      opponent,
      result,
      stats: {
        seconds_played: r.secondsPlayed,
        points: r.points,
        rebounds_total: r.reboundsOff + r.reboundsDef,
        assists: r.assists,
      },
    };
  });

  return { rows: logRows, nextCursor };
}
