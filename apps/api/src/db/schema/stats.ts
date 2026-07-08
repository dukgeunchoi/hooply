import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { game } from "./games";
import { season } from "./leagues";
import { player, team } from "./teams";

export const playerGameStat = pgTable(
  "player_game_stat",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    playerId: uuid("player_id")
      .notNull()
      .references(() => player.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id),
    secondsPlayed: integer("seconds_played").notNull().default(0),
    points: integer("points").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    reboundsOff: integer("rebounds_off").notNull().default(0),
    reboundsDef: integer("rebounds_def").notNull().default(0),
    steals: integer("steals").notNull().default(0),
    blocks: integer("blocks").notNull().default(0),
    turnovers: integer("turnovers").notNull().default(0),
    fouls: integer("fouls").notNull().default(0),
    fgMade: integer("fg_made").notNull().default(0),
    fgAtt: integer("fg_att").notNull().default(0),
    threeMade: integer("three_made").notNull().default(0),
    threeAtt: integer("three_att").notNull().default(0),
    ftMade: integer("ft_made").notNull().default(0),
    ftAtt: integer("ft_att").notNull().default(0),
    plusMinus: integer("plus_minus"),
    isStarter: boolean("is_starter").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.playerId] }),
    teamIdx: index("player_game_stat_team_id_idx").on(t.teamId),
  }),
);

export const teamGameStat = pgTable(
  "team_game_stat",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id),
    points: integer("points").notNull().default(0),
    reboundsOff: integer("rebounds_off").notNull().default(0),
    reboundsDef: integer("rebounds_def").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    steals: integer("steals").notNull().default(0),
    blocks: integer("blocks").notNull().default(0),
    turnovers: integer("turnovers").notNull().default(0),
    fouls: integer("fouls").notNull().default(0),
    fgMade: integer("fg_made").notNull().default(0),
    fgAtt: integer("fg_att").notNull().default(0),
    threeMade: integer("three_made").notNull().default(0),
    threeAtt: integer("three_att").notNull().default(0),
    ftMade: integer("ft_made").notNull().default(0),
    ftAtt: integer("ft_att").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.teamId] }),
  }),
);

export const standing = pgTable(
  "standing",
  {
    seasonId: uuid("season_id")
      .notNull()
      .references(() => season.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id),
    rank: integer("rank").notNull(),
    played: integer("played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    winPct: numeric("win_pct", { precision: 5, scale: 3 }).notNull().default("0"),
    pointsFor: integer("points_for").notNull().default(0),
    pointsAgainst: integer("points_against").notNull().default(0),
    streak: text("streak"),
    gamesBehind: numeric("games_behind", { precision: 5, scale: 1 }),
    conference: text("conference"),
    groupName: text("group_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.seasonId, t.teamId] }),
  }),
);
