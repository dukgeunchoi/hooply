import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { season } from "./leagues";

export const team = pgTable(
  "team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    externalIds: jsonb("external_ids"),
    name: text("name").notNull(),
    shortName: text("short_name"),
    code: text("code"),
    logoUrl: text("logo_url"),
    country: text("country"),
    canonicalId: uuid("canonical_id").references((): AnyPgColumn => team.id),
  },
  (t) => ({
    providerRefUnique: uniqueIndex("team_provider_ref_unique").on(t.provider, t.providerRef),
  }),
);

export const teamSeason = pgTable(
  "team_season",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    conference: text("conference"),
    groupName: text("group_name"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.seasonId] }),
  }),
);

export const player = pgTable(
  "player",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    externalIds: jsonb("external_ids"),
    teamId: uuid("team_id").references(() => team.id),
    fullName: text("full_name").notNull(),
    position: text("position"),
    jerseyNumber: integer("jersey_number"),
    heightCm: integer("height_cm"),
    weightKg: integer("weight_kg"),
    country: text("country"),
    photoUrl: text("photo_url"),
    canonicalId: uuid("canonical_id").references((): AnyPgColumn => player.id),
  },
  (t) => ({
    providerRefUnique: uniqueIndex("player_provider_ref_unique").on(t.provider, t.providerRef),
    teamIdx: index("player_team_id_idx").on(t.teamId),
  }),
);
