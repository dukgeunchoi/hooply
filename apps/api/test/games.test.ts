import type { GameDetail, LeagueGames } from "@hooply/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createGamesRouter } from "../src/routes/games";

function notImplemented(name: string) {
  return async () => {
    throw new Error(`${name} should not have been called`);
  };
}

function makeApp(
  overrides: {
    getGamesForDate?: (date: string) => Promise<{ leagues: LeagueGames[]; delayed: boolean }>;
    getGameById?: (id: string) => Promise<{ game: GameDetail; delayed: boolean } | null>;
  } = {},
) {
  const app = express();
  app.use(
    "/v1/games",
    createGamesRouter({
      getGamesForDate: overrides.getGamesForDate ?? notImplemented("getGamesForDate"),
      getGameById: overrides.getGameById ?? notImplemented("getGameById"),
    }),
  );
  return app;
}

// These are fast unit tests against a fake query module — the real join/
// staleness/serialization behavior of getGamesForDate is covered by
// packages/db/test/queries/games.test.ts against a real Postgres. This
// route only owns param parsing and envelope wrapping.
describe("GET /v1/games", () => {
  it("rejects a missing or malformed date param without calling the query", async () => {
    const app = makeApp();

    const missing = await request(app).get("/v1/games");
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("bad_request");

    const malformed = await request(app).get("/v1/games?date=07-07-2026");
    expect(malformed.status).toBe(400);
  });

  it("passes the parsed date to the query and wraps the result in the envelope", async () => {
    const leagues: LeagueGames[] = [
      { league: { id: "l1", name: "NBA", logo_url: null }, games: [] },
    ];
    let receivedDate: string | undefined;
    const app = makeApp({
      getGamesForDate: async (date) => {
        receivedDate = date;
        return { leagues, delayed: false };
      },
    });

    const res = await request(app).get("/v1/games?date=2026-07-07");

    expect(receivedDate).toBe("2026-07-07");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.body.data).toEqual(leagues);
    expect(res.body.meta.delayed).toBe(false);
  });

  it("surfaces delayed:true from the query result", async () => {
    const app = makeApp({ getGamesForDate: async () => ({ leagues: [], delayed: true }) });

    const res = await request(app).get("/v1/games?date=2026-07-07");

    expect(res.body.meta.delayed).toBe(true);
  });
});

const GAME_ID = "22222222-2222-2222-2222-222222222222";

function makeGameDetail(overrides: Partial<GameDetail> = {}): GameDetail {
  return {
    id: GAME_ID,
    status: "live",
    tipoff_at: "2026-07-07T02:00:00.000Z",
    period: 3,
    clock: "07:42",
    venue: "Crypto.com Arena",
    league: { id: "l1", name: "NBA" },
    home: {
      team: { id: "t1", name: "Lakers", code: "LAL", logo_url: null },
      score: 78,
      period_scores: [28, 25, 25],
    },
    away: {
      team: { id: "t2", name: "Celtics", code: "BOS", logo_url: null },
      score: 71,
      period_scores: [30, 22, 19],
    },
    ...overrides,
  };
}

// Fast unit test against a fake query module — the real join/serialization
// behavior of getGameById is covered by packages/db/test/queries/games.test.ts
// against a real Postgres. This route only owns the 404 branching,
// live-vs-final Cache-Control, and envelope wrapping.
describe("GET /v1/games/:id", () => {
  it("404s for a game that doesn't exist", async () => {
    const app = makeApp({ getGameById: async () => null });

    const res = await request(app).get(`/v1/games/${GAME_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("passes the id to the query and wraps the result in the envelope, no-store while live", async () => {
    const detail = makeGameDetail({ status: "live" });
    let receivedId: string | undefined;
    const app = makeApp({
      getGameById: async (id) => {
        receivedId = id;
        return { game: detail, delayed: false };
      },
    });

    const res = await request(app).get(`/v1/games/${GAME_ID}`);

    expect(receivedId).toBe(GAME_ID);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.data).toEqual(detail);
    expect(res.body.meta.delayed).toBe(false);
  });

  it("returns the correctly shaped body and caches for an hour once the game is final", async () => {
    const detail = makeGameDetail({ status: "final", period: null, clock: null });
    const app = makeApp({ getGameById: async () => ({ game: detail, delayed: false }) });

    const res = await request(app).get(`/v1/games/${GAME_ID}`);

    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.data).toEqual(detail);
  });

  it("returns the correctly shaped body and does not cache a scheduled game", async () => {
    const detail = makeGameDetail({
      status: "scheduled",
      period: null,
      clock: null,
      home: {
        team: { id: "t1", name: "Lakers", code: "LAL", logo_url: null },
        score: 0,
        period_scores: [],
      },
      away: {
        team: { id: "t2", name: "Celtics", code: "BOS", logo_url: null },
        score: 0,
        period_scores: [],
      },
    });
    const app = makeApp({ getGameById: async () => ({ game: detail, delayed: false }) });

    const res = await request(app).get(`/v1/games/${GAME_ID}`);

    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.data).toEqual(detail);
  });

  it("surfaces delayed:true from the query result", async () => {
    const detail = makeGameDetail({ status: "live" });
    const app = makeApp({ getGameById: async () => ({ game: detail, delayed: true }) });

    const res = await request(app).get(`/v1/games/${GAME_ID}`);

    expect(res.body.meta.delayed).toBe(true);
  });
});
