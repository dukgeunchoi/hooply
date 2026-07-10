import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { devicePlatformEnum, favoriteEntityTypeEnum } from "./enums";

export const device = pgTable("device", {
  id: uuid("id").primaryKey().defaultRandom(),
  pushToken: text("push_token").unique(),
  platform: devicePlatformEnum("platform").notNull(),
  locale: text("locale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const favorite = pgTable(
  "favorite",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => device.id),
    entityType: favoriteEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.deviceId, t.entityType, t.entityId] }),
    entityIdx: index("favorite_entity_type_entity_id_idx").on(t.entityType, t.entityId),
  }),
);
