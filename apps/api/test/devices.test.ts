import type { Favorite } from "@hooply/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDevicesRouter } from "../src/routes/devices";

function notImplemented(name: string) {
  return async () => {
    throw new Error(`${name} should not have been called`);
  };
}

function makeApp(
  overrides: {
    upsertDevice?: (input: {
      deviceId: string;
      platform: "ios" | "android";
      pushToken: string | null;
    }) => Promise<{ id: string; platform: "ios" | "android"; pushToken: string | null }>;
    replaceFavorites?: (
      deviceId: string,
      favorites: { entityType: "team" | "league"; entityId: string }[],
    ) => Promise<Favorite[] | null>;
  } = {},
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/v1/devices",
    createDevicesRouter({
      upsertDevice: overrides.upsertDevice ?? notImplemented("upsertDevice"),
      replaceFavorites: overrides.replaceFavorites ?? notImplemented("replaceFavorites"),
    }),
  );
  return app;
}

const DEVICE_ID = "11111111-1111-1111-1111-111111111111";
const TEAM_ID = "22222222-2222-2222-2222-222222222222";
const LEAGUE_ID = "33333333-3333-3333-3333-333333333333";

// Fast unit tests against a fake query module — the real upsert/token-steal
// and full-replace behavior is covered by
// packages/db/test/queries/devices.test.ts against a real Postgres. This
// router only owns body/param validation, 404 branching, and envelope
// wrapping.
describe("POST /v1/devices", () => {
  it("rejects a malformed body without calling the query", async () => {
    const app = makeApp();

    const res = await request(app).post("/v1/devices").send({ device_id: "not-a-uuid" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("rejects an invalid platform", async () => {
    const app = makeApp();

    const res = await request(app)
      .post("/v1/devices")
      .send({ device_id: DEVICE_ID, platform: "windows", push_token: "t" });

    expect(res.status).toBe(400);
  });

  it("upserts and wraps the result in the envelope, push_token omitted", async () => {
    let received: unknown;
    const app = makeApp({
      upsertDevice: async (input) => {
        received = input;
        return { id: DEVICE_ID, platform: "ios", pushToken: null };
      },
    });

    const res = await request(app)
      .post("/v1/devices")
      .send({ device_id: DEVICE_ID, platform: "ios" });

    expect(received).toEqual({ deviceId: DEVICE_ID, platform: "ios", pushToken: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ device_id: DEVICE_ID, platform: "ios", push_token: null });
  });

  it("passes push_token through when provided (repeat call / token rotation)", async () => {
    let received: unknown;
    const app = makeApp({
      upsertDevice: async (input) => {
        received = input;
        return { id: DEVICE_ID, platform: "ios", pushToken: "expo-token" };
      },
    });

    const res = await request(app)
      .post("/v1/devices")
      .send({ device_id: DEVICE_ID, platform: "ios", push_token: "expo-token" });

    expect(received).toEqual({
      deviceId: DEVICE_ID,
      platform: "ios",
      pushToken: "expo-token",
    });
    expect(res.body.data.push_token).toBe("expo-token");
  });
});

describe("PUT /v1/devices/:deviceId/favorites", () => {
  it("rejects a malformed favorites body without calling the query", async () => {
    const app = makeApp();

    const res = await request(app)
      .put(`/v1/devices/${DEVICE_ID}/favorites`)
      .send({ favorites: [{ entity_type: "bogus", entity_id: TEAM_ID }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("404s when the device isn't registered", async () => {
    const app = makeApp({ replaceFavorites: async () => null });

    const res = await request(app)
      .put(`/v1/devices/${DEVICE_ID}/favorites`)
      .send({ favorites: [] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("passes the parsed favorites to the query and wraps the result in the envelope", async () => {
    let receivedId: string | undefined;
    let receivedFavorites: unknown;
    const favorites: Favorite[] = [{ entity_type: "team", entity_id: TEAM_ID }];
    const app = makeApp({
      replaceFavorites: async (deviceId, favs) => {
        receivedId = deviceId;
        receivedFavorites = favs;
        return favorites;
      },
    });

    const res = await request(app)
      .put(`/v1/devices/${DEVICE_ID}/favorites`)
      .send({ favorites: [{ entity_type: "team", entity_id: TEAM_ID }] });

    expect(receivedId).toBe(DEVICE_ID);
    expect(receivedFavorites).toEqual([{ entityType: "team", entityId: TEAM_ID }]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(favorites);
  });

  it("removes a favorite by sending the remaining list without it", async () => {
    let receivedFavorites: unknown;
    const remaining = [{ entity_type: "league" as const, entity_id: LEAGUE_ID }];
    const app = makeApp({
      replaceFavorites: async (_deviceId, favs) => {
        receivedFavorites = favs;
        return remaining;
      },
    });

    const res = await request(app)
      .put(`/v1/devices/${DEVICE_ID}/favorites`)
      .send({ favorites: [{ entity_type: "league", entity_id: LEAGUE_ID }] });

    expect(receivedFavorites).toEqual([{ entityType: "league", entityId: LEAGUE_ID }]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(remaining);
  });

  it("accepts an empty list (unfollow everything)", async () => {
    const app = makeApp({ replaceFavorites: async () => [] });

    const res = await request(app)
      .put(`/v1/devices/${DEVICE_ID}/favorites`)
      .send({ favorites: [] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
