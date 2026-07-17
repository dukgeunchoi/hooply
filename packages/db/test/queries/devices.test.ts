import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import { replaceFavorites, upsertDevice } from "../../src/queries/devices";
import { device, favorite } from "../../src/schema/index";

async function resetDeviceTables() {
  await db.delete(favorite);
  await db.delete(device);
}

describe("upsertDevice", () => {
  beforeEach(resetDeviceTables);
  afterAll(resetDeviceTables);

  it("inserts a new device on first call", async () => {
    const deviceId = randomUUID();

    const row = await upsertDevice({ deviceId, platform: "ios", pushToken: "token-1" });

    expect(row).toEqual({ id: deviceId, platform: "ios", pushToken: "token-1" });
  });

  it("succeeds idempotently on a repeat call with the same device_id", async () => {
    const deviceId = randomUUID();
    await upsertDevice({ deviceId, platform: "ios", pushToken: null });

    const row = await upsertDevice({ deviceId, platform: "ios", pushToken: "token-2" });

    expect(row).toEqual({ id: deviceId, platform: "ios", pushToken: "token-2" });
    const rows = await db.select().from(device);
    expect(rows).toHaveLength(1);
  });

  it("updates platform and last_seen_at in place on a repeat call", async () => {
    const deviceId = randomUUID();
    await upsertDevice({ deviceId, platform: "ios", pushToken: "token-1" });

    const row = await upsertDevice({ deviceId, platform: "android", pushToken: "token-1" });

    expect(row).toEqual({ id: deviceId, platform: "android", pushToken: "token-1" });
  });

  it("steals the push token: an existing device row with that token is replaced by the new device_id", async () => {
    const oldDeviceId = randomUUID();
    const newDeviceId = randomUUID();
    await upsertDevice({ deviceId: oldDeviceId, platform: "ios", pushToken: "shared-token" });

    const row = await upsertDevice({
      deviceId: newDeviceId,
      platform: "ios",
      pushToken: "shared-token",
    });

    expect(row).toEqual({ id: newDeviceId, platform: "ios", pushToken: "shared-token" });
    const rows = await db.select({ id: device.id }).from(device);
    expect(rows).toEqual([{ id: newDeviceId }]);
  });

  it("drops the old device's favorites when its push token is stolen (ADR-0004)", async () => {
    const oldDeviceId = randomUUID();
    const newDeviceId = randomUUID();
    const teamId = randomUUID();
    await upsertDevice({ deviceId: oldDeviceId, platform: "ios", pushToken: "shared-token" });
    await replaceFavorites(oldDeviceId, [{ entityType: "team", entityId: teamId }]);

    await upsertDevice({ deviceId: newDeviceId, platform: "ios", pushToken: "shared-token" });

    const favorites = await db.select().from(favorite);
    expect(favorites).toHaveLength(0);
  });
});

describe("replaceFavorites", () => {
  beforeEach(resetDeviceTables);
  afterAll(resetDeviceTables);

  it("returns null for a device_id that was never registered", async () => {
    const result = await replaceFavorites(randomUUID(), [
      { entityType: "team", entityId: randomUUID() },
    ]);
    expect(result).toBeNull();
  });

  it("returns null instead of throwing for a malformed device_id", async () => {
    const result = await replaceFavorites("not-a-uuid", []);
    expect(result).toBeNull();
  });

  it("adds favorites for a registered device", async () => {
    const deviceId = randomUUID();
    const teamId = randomUUID();
    const leagueId = randomUUID();
    await upsertDevice({ deviceId, platform: "ios", pushToken: null });

    const result = await replaceFavorites(deviceId, [
      { entityType: "team", entityId: teamId },
      { entityType: "league", entityId: leagueId },
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        { entity_type: "team", entity_id: teamId },
        { entity_type: "league", entity_id: leagueId },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it("fully replaces the previous list, removing anything not resent", async () => {
    const deviceId = randomUUID();
    const teamId = randomUUID();
    const leagueId = randomUUID();
    await upsertDevice({ deviceId, platform: "ios", pushToken: null });
    await replaceFavorites(deviceId, [
      { entityType: "team", entityId: teamId },
      { entityType: "league", entityId: leagueId },
    ]);

    const result = await replaceFavorites(deviceId, [{ entityType: "league", entityId: leagueId }]);

    expect(result).toEqual([{ entity_type: "league", entity_id: leagueId }]);
  });

  it("clears all favorites when sent an empty list", async () => {
    const deviceId = randomUUID();
    const teamId = randomUUID();
    await upsertDevice({ deviceId, platform: "ios", pushToken: null });
    await replaceFavorites(deviceId, [{ entityType: "team", entityId: teamId }]);

    const result = await replaceFavorites(deviceId, []);

    expect(result).toEqual([]);
    const rows = await db.select().from(favorite).where(eq(favorite.deviceId, deviceId));
    expect(rows).toHaveLength(0);
  });

  it("dedupes a request that lists the same favorite twice instead of erroring", async () => {
    const deviceId = randomUUID();
    const teamId = randomUUID();
    await upsertDevice({ deviceId, platform: "ios", pushToken: null });

    const result = await replaceFavorites(deviceId, [
      { entityType: "team", entityId: teamId },
      { entityType: "team", entityId: teamId },
    ]);

    expect(result).toEqual([{ entity_type: "team", entity_id: teamId }]);
  });
});
