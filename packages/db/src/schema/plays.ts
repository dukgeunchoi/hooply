import { integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { game } from "./games";
import { player, team } from "./teams";

export const playByPlay = pgTable(
  "play_by_play",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => game.id),
    seq: integer("seq").notNull(),
    period: integer("period").notNull(),
    clock: text("clock"),
    eventType: text("event_type").notNull(),
    teamId: uuid("team_id").references(() => team.id),
    playerId: uuid("player_id").references(() => player.id),
    detail: jsonb("detail"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gameId, t.seq] }),
  }),
);
