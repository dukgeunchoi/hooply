import { z } from "zod";
import { envelopeSchema } from "./envelope";

export const gameStatusSchema = z.enum([
  "scheduled",
  "live",
  "final",
  "suspended",
  "postponed",
  "cancelled",
]);

export type GameStatus = z.infer<typeof gameStatusSchema>;

export const teamRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable(),
  logo_url: z.string().nullable(),
});

const gameSideSchema = z.object({
  team: teamRefSchema,
  score: z.number().int(),
});

export const gameSchema = z.object({
  id: z.string().uuid(),
  status: gameStatusSchema,
  tipoff_at: z.string().datetime(),
  period: z.number().int().nullable(),
  clock: z.string().nullable(),
  venue: z.string().nullable(),
  home: gameSideSchema,
  away: gameSideSchema,
});

export type Game = z.infer<typeof gameSchema>;

export const leagueGamesSchema = z.object({
  league: z.object({
    id: z.string().uuid(),
    name: z.string(),
    logo_url: z.string().nullable(),
  }),
  games: z.array(gameSchema),
});

export type LeagueGames = z.infer<typeof leagueGamesSchema>;

export const gamesResponseSchema = envelopeSchema(z.array(leagueGamesSchema));

export type GamesResponse = z.infer<typeof gamesResponseSchema>;

export const leagueGamesResponseSchema = envelopeSchema(z.array(gameSchema));

export type LeagueGamesResponse = z.infer<typeof leagueGamesResponseSchema>;
