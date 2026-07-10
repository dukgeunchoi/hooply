import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const league = pgTable(
  "league",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    externalIds: jsonb("external_ids"),
    name: text("name").notNull(),
    country: text("country"),
    logoUrl: text("logo_url"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    quarterDurationMins: integer("quarter_duration_mins").notNull(),
    otDurationMins: integer("ot_duration_mins").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerRefUnique: uniqueIndex("league_provider_ref_unique").on(t.provider, t.providerRef),
  }),
);

export const season = pgTable(
  "season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => league.id),
    providerRef: text("provider_ref"),
    label: text("label").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    isCurrent: boolean("is_current").notNull().default(false),
  },
  (t) => ({
    leagueIdx: index("season_league_id_idx").on(t.leagueId),
    providerRefUnique: uniqueIndex("season_league_id_provider_ref_unique").on(
      t.leagueId,
      t.providerRef,
    ),
  }),
);
