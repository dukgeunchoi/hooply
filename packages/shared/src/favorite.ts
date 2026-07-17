import { z } from "zod";
import { envelopeSchema } from "./envelope";

export const favoriteEntityTypeSchema = z.enum(["team", "league"]);

export type FavoriteEntityType = z.infer<typeof favoriteEntityTypeSchema>;

export const favoriteSchema = z.object({
  entity_type: favoriteEntityTypeSchema,
  entity_id: z.string().uuid(),
});

export type Favorite = z.infer<typeof favoriteSchema>;

// PUT /v1/devices/{device_id}/favorites body — always the full list (see
// docs/api-spec.md: "simpler than add/remove deltas and self-healing").
export const putFavoritesRequestSchema = z.object({
  favorites: z.array(favoriteSchema),
});

export type PutFavoritesRequest = z.infer<typeof putFavoritesRequestSchema>;

export const favoritesResponseSchema = envelopeSchema(z.array(favoriteSchema));

export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>;
