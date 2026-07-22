import type { PlayerGameLogRow, PlayerProfile } from "@hooply/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPlayersRouter } from "../src/routes/players";

function notImplemented(name: string) {
  return async () => {
    throw new Error(`${name} should not have been called`);
  };
}

const PLAYER_ID = "44444444-4444-4444-4444-444444444444";
const SEASON_ID = "55555555-5555-5555-5555-555555555555";

type GameLogPage = { rows: PlayerGameLogRow[]; nextCursor: string | null };

function makeApp(
  overrides: {
    getPlayerById?: (id: string) => Promise<PlayerProfile | null>;
    getPlayerGameLog?: (
      id: string,
      opts?: { seasonId?: string; cursor?: string },
    ) => Promise<GameLogPage | null>;
  } = {},
) {
  const app = express();
  app.use(
    "/v1/players",
    createPlayersRouter({
      getPlayerById: overrides.getPlayerById ?? notImplemented("getPlayerById"),
      getPlayerGameLog: overrides.getPlayerGameLog ?? notImplemented("getPlayerGameLog"),
    }),
  );
  return app;
}

function makePlayerProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: PLAYER_ID,
    full_name: "Star Player",
    position: "Guard",
    jersey_number: 7,
    height_cm: 198,
    weight_kg: 95,
    country: "USA",
    photo_url: null,
    team: { id: "t1", name: "Thunder", code: "OKC", logo_url: null },
    season_averages: {
      games_played: 10,
      ppg: 25.5,
      rpg: 5.2,
      apg: 6.1,
      mpg: 34,
      fg_pct: 0.48,
      three_pct: 0.4,
      ft_pct: 0.85,
    },
    ...overrides,
  };
}

// Fast unit tests against a fake query module — the real join/aggregation
// behavior lives in packages/db/test/queries/players.test.ts against a real
// Postgres. These routes only own 404/400 branching, param parsing, and
// envelope wrapping.
describe("GET /v1/players/:id", () => {
  it("404s for a player that doesn't exist", async () => {
    const app = makeApp({ getPlayerById: async () => null });

    const res = await request(app).get(`/v1/players/${PLAYER_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("passes the id to the query, caches for an hour, and wraps the result in the envelope", async () => {
    const profile = makePlayerProfile();
    let receivedId: string | undefined;
    const app = makeApp({
      getPlayerById: async (id) => {
        receivedId = id;
        return profile;
      },
    });

    const res = await request(app).get(`/v1/players/${PLAYER_ID}`);

    expect(receivedId).toBe(PLAYER_ID);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.data).toEqual(profile);
  });

  it("renders team null (Free Agent) and season_averages null", async () => {
    const profile = makePlayerProfile({ team: null, season_averages: null });
    const app = makeApp({ getPlayerById: async () => profile });

    const res = await request(app).get(`/v1/players/${PLAYER_ID}`);

    expect(res.body.data.team).toBeNull();
    expect(res.body.data.season_averages).toBeNull();
  });
});

describe("GET /v1/players/:id/stats", () => {
  it("404s for a player that doesn't exist", async () => {
    const app = makeApp({ getPlayerGameLog: async () => null });

    const res = await request(app).get(`/v1/players/${PLAYER_ID}/stats`);

    expect(res.status).toBe(404);
  });

  it("400s when ?season= isn't a well-formed uuid", async () => {
    const app = makeApp();

    const res = await request(app).get(`/v1/players/${PLAYER_ID}/stats?season=not-a-uuid`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("400s when ?cursor= isn't a parseable date", async () => {
    const app = makeApp();

    const res = await request(app).get(`/v1/players/${PLAYER_ID}/stats?cursor=not-a-date`);

    expect(res.status).toBe(400);
  });

  it("passes season/cursor through, wraps rows in the envelope with meta.next_cursor", async () => {
    const rows: PlayerGameLogRow[] = [];
    let received: { seasonId?: string; cursor?: string } = {};
    const app = makeApp({
      getPlayerGameLog: async (_id, opts = {}) => {
        received = opts;
        return { rows, nextCursor: "2026-01-01T00:00:00.000Z" };
      },
    });

    const res = await request(app).get(
      `/v1/players/${PLAYER_ID}/stats?season=${SEASON_ID}&cursor=2026-02-01T00:00:00.000Z`,
    );

    expect(received).toEqual({
      seasonId: SEASON_ID,
      cursor: "2026-02-01T00:00:00.000Z",
    });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.data).toEqual(rows);
    expect(res.body.meta.next_cursor).toBe("2026-01-01T00:00:00.000Z");
  });

  it("omits season/cursor from the query call when not provided", async () => {
    let received: { seasonId?: string; cursor?: string } = { seasonId: "x", cursor: "y" };
    const app = makeApp({
      getPlayerGameLog: async (_id, opts = {}) => {
        received = opts;
        return { rows: [], nextCursor: null };
      },
    });

    const res = await request(app).get(`/v1/players/${PLAYER_ID}/stats`);

    expect(received).toEqual({ seasonId: undefined, cursor: undefined });
    expect(res.body.meta.next_cursor).toBeNull();
  });
});
