import { z } from "zod";
import { envelopeSchema } from "./envelope";

export const leagueSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  country: z.string().nullable(),
  logo_url: z.string().nullable(),
  priority: z.number().int(),
  current_season_id: z.string().uuid().nullable(),
});

export type League = z.infer<typeof leagueSchema>;

export const leaguesResponseSchema = envelopeSchema(z.array(leagueSchema));

export type LeaguesResponse = z.infer<typeof leaguesResponseSchema>;
