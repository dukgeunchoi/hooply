import type { StandingGroup } from "@hooply/shared";
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
const SEASON_ID = "22222222-2222-2222-2222-222222222222";

function makeApp(overrides: {
  getLeagueById?: (id: string) => Promise<{ id: string } | null>;
  getSeasonById?: (seasonId: string, leagueId: string) => Promise<{ id: string } | null>;
  getCurrentSeason?: (leagueId: string) => Promise<{ id: string } | null>;
  getStandingsForSeason?: (
    seasonId: string,
  ) => Promise<{ standings: StandingGroup[]; delayed: boolean }>;
}) {
  const app = express();
  app.use(
    "/v1/leagues",
    createLeaguesRouter({
      getActiveLeagues: notImplemented("getActiveLeagues"),
      getLeagueById: overrides.getLeagueById ?? (async (id) => ({ id })),
      getSeasonById: overrides.getSeasonById ?? notImplemented("getSeasonById"),
      getCurrentSeason: overrides.getCurrentSeason ?? (async () => null),
      getStandingsForSeason:
        overrides.getStandingsForSeason ?? notImplemented("getStandingsForSeason"),
      getGamesForLeagueRange: notImplemented("getGamesForLeagueRange"),
    }),
  );
  return app;
}

// Fast unit tests against a fake query module — the real join/grouping/
// staleness behavior of getStandingsForSeason lives in
// packages/db/test/queries/standings.test.ts against a real Postgres. This
// route only owns the 404/400/200-empty season-resolution branching and
// envelope wrapping.
describe("GET /v1/leagues/:id/standings", () => {
  it("404s for a league that doesn't exist", async () => {
    const app = makeApp({ getLeagueById: async () => null });

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("400s when ?season= isn't a well-formed uuid", async () => {
    const app = makeApp({});

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings?season=not-a-uuid`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("400s when ?season= doesn't belong to the requested league", async () => {
    const app = makeApp({ getSeasonById: async () => null });

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings?season=${SEASON_ID}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("returns an empty list when no current season has been seeded yet, without calling getStandingsForSeason", async () => {
    const app = makeApp({ getCurrentSeason: async () => null });

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("resolves the current season by default and wraps the result in the envelope", async () => {
    const standings: StandingGroup[] = [];
    let receivedSeasonId: string | undefined;
    const app = makeApp({
      getCurrentSeason: async () => ({ id: SEASON_ID }),
      getStandingsForSeason: async (seasonId) => {
        receivedSeasonId = seasonId;
        return { standings, delayed: false };
      },
    });

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings`);

    expect(receivedSeasonId).toBe(SEASON_ID);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.body.data).toEqual(standings);
  });

  it("uses an explicit ?season= param instead of the current season", async () => {
    let calledCurrentSeason = false;
    let receivedSeasonId: string | undefined;
    const app = makeApp({
      getSeasonById: async (seasonId) => ({ id: seasonId }),
      getCurrentSeason: async () => {
        calledCurrentSeason = true;
        return null;
      },
      getStandingsForSeason: async (seasonId) => {
        receivedSeasonId = seasonId;
        return { standings: [], delayed: false };
      },
    });

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings?season=${SEASON_ID}`);

    expect(calledCurrentSeason).toBe(false);
    expect(receivedSeasonId).toBe(SEASON_ID);
    expect(res.status).toBe(200);
  });

  it("surfaces delayed:true from the query result", async () => {
    const app = makeApp({
      getCurrentSeason: async () => ({ id: SEASON_ID }),
      getStandingsForSeason: async () => ({ standings: [], delayed: true }),
    });

    const res = await request(app).get(`/v1/leagues/${LEAGUE_ID}/standings`);

    expect(res.body.meta.delayed).toBe(true);
  });
});
