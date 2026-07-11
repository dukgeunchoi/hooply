import { team } from "@hooply/db";
import type { Game, GameStatus } from "@hooply/shared";
import { alias } from "drizzle-orm/pg-core";

export const homeTeam = alias(team, "home_team");
export const awayTeam = alias(team, "away_team");

export type GameRow = {
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

export function serializeGameRow(r: GameRow): Game {
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
