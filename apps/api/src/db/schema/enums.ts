import { pgEnum } from "drizzle-orm/pg-core";

export const gameStatusEnum = pgEnum("game_status", [
  "scheduled",
  "live",
  "final",
  "suspended",
  "postponed",
  "cancelled",
]);

export const devicePlatformEnum = pgEnum("device_platform", ["ios", "android"]);

export const favoriteEntityTypeEnum = pgEnum("favorite_entity_type", ["team", "league"]);
