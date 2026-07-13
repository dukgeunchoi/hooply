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

// The cheap polling target (GET /v1/games/live, Redis-backed) — deliberately
// a minimal subset of `gameSchema`. The client already has team/tipoff_at/
// venue from the slow GET /v1/games poll and only needs the fields that
// actually change while a game is live, merged in by id.
export const liveGameSchema = z.object({
  id: z.string().uuid(),
  status: gameStatusSchema,
  period: z.number().int().nullable(),
  clock: z.string().nullable(),
  home: z.object({ score: z.number().int() }),
  away: z.object({ score: z.number().int() }),
});

export type LiveGame = z.infer<typeof liveGameSchema>;

export const liveGamesResponseSchema = envelopeSchema(z.array(liveGameSchema));

export type LiveGamesResponse = z.infer<typeof liveGamesResponseSchema>;

// The internal Redis wire format at `live:game:{id}` — written by
// apps/worker/src/ingestion/live-games.ts, read by apps/api's live route.
// Distinct from `liveGameSchema` above (the public HTTP response shape):
// this one is camelCase (never serialized to a client) and carries
// `updatedAt` for the API's staleness check, which clients don't need.
export const liveGameSnapshotSchema = z.object({
  id: z.string().uuid(),
  status: gameStatusSchema,
  period: z.number().int().nullable(),
  clock: z.string().nullable(),
  homeScore: z.number().int(),
  awayScore: z.number().int(),
  updatedAt: z.string(),
});

export type LiveGameSnapshot = z.infer<typeof liveGameSnapshotSchema>;
