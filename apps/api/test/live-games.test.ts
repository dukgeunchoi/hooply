import { redis } from "@hooply/db";
import { liveGamesResponseSchema } from "@hooply/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

async function resetLiveKeys() {
  await redis.flushdb();
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "11111111-1111-1111-1111-111111111111",
    status: "live",
    period: 3,
    clock: "07:42",
    homeScore: 78,
    awayScore: 71,
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

describe("GET /v1/games/live", () => {
  beforeEach(resetLiveKeys);
  afterAll(resetLiveKeys);

  it("returns every game currently in the live Redis feed, matching the envelope schema", async () => {
    await redis.set("live:game:11111111-1111-1111-1111-111111111111", snapshot());
    await redis.set(
      "live:game:22222222-2222-2222-2222-222222222222",
      snapshot({
        id: "22222222-2222-2222-2222-222222222222",
        period: 1,
        clock: "10:00",
        homeScore: 5,
        awayScore: 2,
      }),
    );

    const app = createApp();
    const res = await request(app).get("/v1/games/live");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");

    const parsed = liveGamesResponseSchema.parse(res.body);
    expect(parsed.data).toHaveLength(2);
    const game1 = parsed.data.find((g) => g.id === "11111111-1111-1111-1111-111111111111");
    expect(game1).toMatchObject({
      status: "live",
      period: 3,
      clock: "07:42",
      home: { score: 78 },
      away: { score: 71 },
    });
    expect(parsed.meta.delayed).toBe(false);
  });

  it("returns an empty list when no games are live", async () => {
    const app = createApp();
    const res = await request(app).get("/v1/games/live");

    expect(res.status).toBe(200);
    const parsed = liveGamesResponseSchema.parse(res.body);
    expect(parsed.data).toEqual([]);
    expect(parsed.meta.delayed).toBe(false);
  });

  it("marks the response delayed when a live snapshot hasn't updated in over 60s", async () => {
    const staleDate = new Date(Date.now() - 90 * 1000);
    await redis.set(
      "live:game:11111111-1111-1111-1111-111111111111",
      snapshot({ updatedAt: staleDate.toISOString() }),
    );

    const app = createApp();
    const res = await request(app).get("/v1/games/live");

    expect(res.body.meta.delayed).toBe(true);
  });

  it("does not surface a game once it's dropped from the live feed (e.g. suspended/final)", async () => {
    // Mirrors what the worker does on a live -> suspended/final transition:
    // the key is deleted outright rather than left with a stale status.
    await redis.set("live:game:11111111-1111-1111-1111-111111111111", snapshot());
    await redis.del("live:game:11111111-1111-1111-1111-111111111111");

    const app = createApp();
    const res = await request(app).get("/v1/games/live");

    const parsed = liveGamesResponseSchema.parse(res.body);
    expect(parsed.data).toEqual([]);
  });

  it("skips a malformed snapshot instead of 500ing the whole feed (architecture invariant #5)", async () => {
    await redis.set("live:game:11111111-1111-1111-1111-111111111111", "not json");
    await redis.set(
      "live:game:22222222-2222-2222-2222-222222222222",
      snapshot({ id: "22222222-2222-2222-2222-222222222222" }),
    );

    const app = createApp();
    const res = await request(app).get("/v1/games/live");

    expect(res.status).toBe(200);
    const parsed = liveGamesResponseSchema.parse(res.body);
    expect(parsed.data.map((g) => g.id)).toEqual(["22222222-2222-2222-2222-222222222222"]);
  });
});
