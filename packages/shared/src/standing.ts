import { z } from "zod";
import { envelopeSchema } from "./envelope";
import { teamRefSchema } from "./game";

export const standingRowSchema = z.object({
  rank: z.number().int(),
  team: teamRefSchema,
  played: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  win_pct: z.number(),
  points_for: z.number().int(),
  points_against: z.number().int(),
  games_behind: z.number().nullable(),
  streak: z.string().nullable(),
});

export type StandingRow = z.infer<typeof standingRowSchema>;

export const standingGroupSchema = z.object({
  // Conference or group-stage label ("East", "Group A"); null when the
  // league has no split and standings are a single flat table.
  label: z.string().nullable(),
  standings: z.array(standingRowSchema),
});

export type StandingGroup = z.infer<typeof standingGroupSchema>;

export const standingsResponseSchema = envelopeSchema(z.array(standingGroupSchema));

export type StandingsResponse = z.infer<typeof standingsResponseSchema>;
