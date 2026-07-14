import type { Game } from "@hooply/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLeaguesRouter } from "../src/routes/leagues";

function notImplemented(name: string) {
  return async () => {
    throw new Error(`${name} should not have been called`);
  };
}

const LEAGUE_ID = "11111111-1111-1111-1111-111111111111";

function makeApp(overrides: {
  getLeagueById?: (id: string) => Promise<{ id: string } | null>;
  getGamesForLeagueRange?: (
    leagueId: string,
    from: string,
    to: string,
  ) => Promise<{ games: Game[]; delayed: boolean }>;
}) {
  const app = express();
  app.use(
    "/v1/leagues",
    createLeaguesRouter({
      getActiveLeagues: notImplemented("getActiveLeagues"),
      getLeagueById: overrides.getLeagueById ?? (async (id) => ({ id })),
      getSeasonById: notImplemented("getSeasonById"),
      getCurrentSeason: notImplemented("getCurrentSeason"),
      getStandingsForSeason: notImplemented("getStandingsForSeason"),
      getGamesForLeagueRange:
        overrides.getGamesForLeagueRange ?? notImplemented("getGamesForLeagueRange"),
    }),
  );
  return app;
}

// Fast unit tests against a fake query module — the real join/filter/
// staleness behavior of getGamesForLeagueRange is covered by
// packages/db/test/queries/league-games.test.ts against a real Postgres.
// This route only owns param parsing, the 404/400 branching, and envelope
// wrapping.
describe("GET /v1/leagues/:id/games", () => {
  it("404s for a league that doesn't exist, without calling getGamesForLeagueRange", async () => {
    const app = makeApp({ getLeagueById: async () => null });

    const res = await request(app).get(
      `/v1/leagues/${LEAGUE_ID}/games?from=2026-07-01&to=2026-07-07`,
    );

    expect(res.status).toBe(404);
  });

  it("400s when from/to are missing or malformed", async () => {
    const app = makeApp({});

    const missing = await request(app).get(`/v1/leagues/${LEAGUE_ID}/games`);
    expect(missing.status).toBe(400);

    const malformed = await request(app).get(
      `/v1/leagues/${LEAGUE_ID}/games?from=07-01-2026&to=2026-07-07`,
    );
    expect(malformed.status).toBe(400);
  });

  it("400s when from is after to, without calling getGamesForLeagueRange", async () => {
    const app = makeApp({});

    const res = await request(app).get(
      `/v1/leagues/${LEAGUE_ID}/games?from=2026-07-10&to=2026-07-01`,
    );

    expect(res.status).toBe(400);
  });

  it("passes leagueId/from/to to the query and wraps the result in the envelope", async () => {
    const games: Game[] = [];
    let received: [string, string, string] | undefined;
    const app = makeApp({
      getGamesForLeagueRange: async (leagueId, from, to) => {
        received = [leagueId, from, to];
        return { games, delayed: false };
      },
    });

    const res = await request(app).get(
      `/v1/leagues/${LEAGUE_ID}/games?from=2026-07-01&to=2026-07-10`,
    );

    expect(received).toEqual([LEAGUE_ID, "2026-07-01", "2026-07-10"]);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.body.data).toEqual(games);
  });
});
