import type { DevicePlatform, Favorite, FavoriteEntityType } from "@hooply/shared";
import { UUID_RE } from "@hooply/shared";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { device, favorite } from "../schema/index";

export type UpsertDeviceInput = {
  deviceId: string;
  platform: DevicePlatform;
  pushToken: string | null;
};

export type DeviceRow = {
  id: string;
  platform: DevicePlatform;
  pushToken: string | null;
};

// Implements ADR-0004 ("device row follows the push token") within the
// favorite -> device foreign key's NO ACTION constraint: Postgres won't let
// a single `ON CONFLICT (push_token) DO UPDATE SET id = ...` statement move
// the primary key out from under referencing favorite rows. Instead, when an
// incoming push_token already belongs to a *different* device_id, that old
// row (and its now-orphaned favorites) is deleted before inserting the new
// one — the same "favorites lost on reinstall" outcome the ADR documents,
// just reached explicitly rather than via an accidental cascade. A repeat
// call with the same device_id (with or without a push token yet — the app
// registers before the notification permission prompt exists, see #22/#23)
// just falls through to the ON CONFLICT(id) update.
export async function upsertDevice(input: UpsertDeviceInput): Promise<DeviceRow> {
  return db.transaction(async (tx) => {
    if (input.pushToken) {
      const [existing] = await tx
        .select({ id: device.id })
        .from(device)
        .where(eq(device.pushToken, input.pushToken));

      if (existing && existing.id !== input.deviceId) {
        await tx.delete(favorite).where(eq(favorite.deviceId, existing.id));
        await tx.delete(device).where(eq(device.id, existing.id));
      }
    }

    const [row] = await tx
      .insert(device)
      .values({
        id: input.deviceId,
        pushToken: input.pushToken,
        platform: input.platform,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: device.id,
        set: {
          pushToken: input.pushToken,
          platform: input.platform,
          lastSeenAt: new Date(),
        },
      })
      .returning({ id: device.id, platform: device.platform, pushToken: device.pushToken });

    if (!row) throw new Error("upsertDevice: insert returned no row");
    return row;
  });
}

export type FavoriteInput = { entityType: FavoriteEntityType; entityId: string };

function dedupeFavorites(favorites: readonly FavoriteInput[]): FavoriteInput[] {
  const byKey = new Map(favorites.map((f) => [`${f.entityType}:${f.entityId}`, f]));
  return Array.from(byKey.values());
}

// Full-replace per docs/api-spec.md: delete + reinsert inside one
// transaction rather than diffing, since the client always sends the whole
// list anyway. Returns null (route 404s) for a device_id that was never
// registered via upsertDevice — the favorite.device_id FK would otherwise
// reject the insert. Deduped first — `favorite`'s PK is
// (device_id, entity_type, entity_id), so a body with the same pair twice
// would otherwise hit a unique-violation and 500 instead of just collapsing
// to one row, which is what a "full-replace with this set" request means.
export async function replaceFavorites(
  deviceId: string,
  rawFavorites: FavoriteInput[],
): Promise<Favorite[] | null> {
  if (!UUID_RE.test(deviceId)) return null;
  const favorites = dedupeFavorites(rawFavorites);

  return db.transaction(async (tx) => {
    const [deviceRow] = await tx
      .select({ id: device.id })
      .from(device)
      .where(eq(device.id, deviceId));
    if (!deviceRow) return null;

    await tx.delete(favorite).where(eq(favorite.deviceId, deviceId));

    if (favorites.length > 0) {
      await tx.insert(favorite).values(
        favorites.map((f) => ({
          deviceId,
          entityType: f.entityType,
          entityId: f.entityId,
        })),
      );
    }

    return favorites.map((f) => ({ entity_type: f.entityType, entity_id: f.entityId }));
  });
}
