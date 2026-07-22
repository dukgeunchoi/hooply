import { z } from "zod";
import { envelopeSchema } from "./envelope";
import { gameSchema } from "./game";

// GET /v1/teams/{id} — profile + current-season record/standing summary
// (docs/api-spec.md). `standing` is null until standings ingestion (#15) has
// run for this team's current season — not an error, just nothing to show
// yet (mirrors the empty-array-instead-of-error pattern GET
// /v1/leagues/{id}/standings already uses).
export const teamStandingSummarySchema = z.object({
  rank: z.number().int(),
  conference: z.string().nullable(),
  group_name: z.string().nullable(),
  wins: z.number().int(),
  losses: z.number().int(),
});

export type TeamStandingSummary = z.infer<typeof teamStandingSummarySchema>;

export const teamProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable(),
  logo_url: z.string().nullable(),
  country: z.string().nullable(),
  league: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  standing: teamStandingSummarySchema.nullable(),
});

export type TeamProfile = z.infer<typeof teamProfileSchema>;

export const teamProfileResponseSchema = envelopeSchema(teamProfileSchema);

export type TeamProfileResponse = z.infer<typeof teamProfileResponseSchema>;

// GET /v1/teams/{id}/games?window=upcoming|past&limit=10 — reuses gameSchema
// (the same shape the Scores/League Hub screens already render).
export const teamGamesResponseSchema = envelopeSchema(z.array(gameSchema));

export type TeamGamesResponse = z.infer<typeof teamGamesResponseSchema>;

// GET /v1/teams/{id}/roster?season={season_id} — flat, sorted by position
// then jersey number; the mobile Roster tab groups by position client-side
// (same "server returns flat, client groups for display" split
// MatchesList/groupByDate already uses for date sections).
export const rosterPlayerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  position: z.string().nullable(),
  jersey_number: z.number().int().nullable(),
});

export type RosterPlayer = z.infer<typeof rosterPlayerSchema>;

export const teamRosterResponseSchema = envelopeSchema(z.array(rosterPlayerSchema));

export type TeamRosterResponse = z.infer<typeof teamRosterResponseSchema>;
