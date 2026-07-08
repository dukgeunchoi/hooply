import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { gameStatusEnum } from "./enums";
import { league, season } from "./leagues";
import { team } from "./teams";

export const game = pgTable(
  "game",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    externalIds: jsonb("external_ids"),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => league.id),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => team.id),
    awayTeamId: uuid("away_team_id")
      .notNull()
      .references(() => team.id),
    tipoffAt: timestamp("tipoff_at", { withTimezone: true }).notNull(),
    status: gameStatusEnum("status").notNull().default("scheduled"),
    period: integer("period"),
    clock: text("clock"),
    homeScore: integer("home_score").notNull().default(0),
    awayScore: integer("away_score").notNull().default(0),
    periodScores: jsonb("period_scores"),
    venue: text("venue"),
    statsSyncedAt: timestamp("stats_synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerRefUnique: uniqueIndex("game_provider_ref_unique").on(t.provider, t.providerRef),
    leagueTipoffIdx: index("game_league_id_tipoff_at_idx").on(t.leagueId, t.tipoffAt),
    homeTeamTipoffIdx: index("game_home_team_id_tipoff_at_idx").on(t.homeTeamId, t.tipoffAt),
    awayTeamTipoffIdx: index("game_away_team_id_tipoff_at_idx").on(t.awayTeamId, t.tipoffAt),
    liveStatusIdx: index("game_live_status_idx").on(t.status).where(sql`${t.status} = 'live'`),
  }),
);
