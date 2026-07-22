import { z } from "zod";
import { envelopeSchema } from "./envelope";
import { gameStatusSchema, teamRefSchema } from "./game";

// GET /v1/players/{id} — profile + current-season averages, computed on
// read from PlayerGameStat (docs/data-model.md's "Season Averages" —
// per-season aggregate, not stored). `team` is null for a free agent
// (player.team_id null); `season_averages` is null rather than a zeroed
// stat line when the player hasn't logged a game this season yet.
export const seasonAveragesSchema = z.object({
  games_played: z.number().int(),
  ppg: z.number(),
  rpg: z.number(),
  apg: z.number(),
  mpg: z.number(),
  fg_pct: z.number().nullable(),
  three_pct: z.number().nullable(),
  ft_pct: z.number().nullable(),
});

export type SeasonAverages = z.infer<typeof seasonAveragesSchema>;

export const playerProfileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  position: z.string().nullable(),
  jersey_number: z.number().int().nullable(),
  height_cm: z.number().int().nullable(),
  weight_kg: z.number().int().nullable(),
  country: z.string().nullable(),
  photo_url: z.string().nullable(),
  team: teamRefSchema.nullable(),
  season_averages: seasonAveragesSchema.nullable(),
});

export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export const playerProfileResponseSchema = envelopeSchema(playerProfileSchema);

export type PlayerProfileResponse = z.infer<typeof playerProfileResponseSchema>;

// GET /v1/players/{id}/stats?season={season_id}&cursor= — one row per game,
// newest first, cursor-paginated (meta.next_cursor). `result` is null until
// the game goes final (nothing to compare yet).
export const playerGameLogRowSchema = z.object({
  game: z.object({
    id: z.string().uuid(),
    tipoff_at: z.string().datetime(),
    status: gameStatusSchema,
  }),
  opponent: teamRefSchema,
  result: z.enum(["W", "L"]).nullable(),
  stats: z.object({
    seconds_played: z.number().int(),
    points: z.number().int(),
    rebounds_total: z.number().int(),
    assists: z.number().int(),
  }),
});

export type PlayerGameLogRow = z.infer<typeof playerGameLogRowSchema>;

export const playerGameLogResponseSchema = envelopeSchema(z.array(playerGameLogRowSchema));

export type PlayerGameLogResponse = z.infer<typeof playerGameLogResponseSchema>;
