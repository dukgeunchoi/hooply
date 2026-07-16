import { z } from "zod";
import { envelopeSchema } from "./envelope";
import { teamRefSchema } from "./game";

// Shared by both team_stats and each player_stats line — the same shooting
// splits/counting stats, just aggregated at different granularity. Keeping
// one schema means the two can't drift on field names.
export const boxScoreStatsSchema = z.object({
  points: z.number().int(),
  rebounds_off: z.number().int(),
  rebounds_def: z.number().int(),
  rebounds_total: z.number().int(),
  assists: z.number().int(),
  steals: z.number().int(),
  blocks: z.number().int(),
  turnovers: z.number().int(),
  fouls: z.number().int(),
  fg_made: z.number().int(),
  fg_att: z.number().int(),
  three_made: z.number().int(),
  three_att: z.number().int(),
  ft_made: z.number().int(),
  ft_att: z.number().int(),
});

export type BoxScoreStats = z.infer<typeof boxScoreStatsSchema>;

export const teamBoxScoreSchema = z.object({
  team: teamRefSchema,
  stats: boxScoreStatsSchema,
});

export type TeamBoxScore = z.infer<typeof teamBoxScoreSchema>;

export const playerBoxScoreSchema = z.object({
  player: z.object({ id: z.string().uuid(), name: z.string() }),
  is_starter: z.boolean(),
  seconds_played: z.number().int(),
  // Nullable per docs/data-model.md — not every provider supplies plus/minus.
  plus_minus: z.number().int().nullable(),
  stats: boxScoreStatsSchema,
});

export type PlayerBoxScore = z.infer<typeof playerBoxScoreSchema>;

// GET /v1/games/{id}/boxscore — grouped by team (home/away) rather than a
// flat array + team_id, matching the home/away idiom `gameDetailSchema`
// already uses elsewhere in this file's sibling (game.ts).
export const boxScoreSchema = z.object({
  team_stats: z.object({
    home: teamBoxScoreSchema,
    away: teamBoxScoreSchema,
  }),
  player_stats: z.object({
    home: z.array(playerBoxScoreSchema),
    away: z.array(playerBoxScoreSchema),
  }),
});

export type BoxScore = z.infer<typeof boxScoreSchema>;

export const boxScoreResponseSchema = envelopeSchema(boxScoreSchema);

export type BoxScoreResponse = z.infer<typeof boxScoreResponseSchema>;
