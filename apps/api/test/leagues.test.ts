import type { League } from "@hooply/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLeaguesRouter } from "../src/routes/leagues";

function notImplemented(name: string) {
  return async () => {
    throw new Error(`${name} should not have been called`);
  };
}

function makeApp(getActiveLeagues: () => Promise<{ leagues: League[]; delayed: boolean }>) {
  const app = express();
  app.use(
    "/v1/leagues",
    createLeaguesRouter({
      getActiveLeagues,
      getLeagueById: notImplemented("getLeagueById"),
      getSeasonById: notImplemented("getSeasonById"),
      getCurrentSeason: notImplemented("getCurrentSeason"),
      getStandingsForSeason: notImplemented("getStandingsForSeason"),
      getGamesForLeagueRange: notImplemented("getGamesForLeagueRange"),
    }),
  );
  return app;
}

// Fast unit tests against a fake query module — the real join/tie-break/
// staleness behavior of getActiveLeagues is covered by
// packages/db/test/queries/leagues.test.ts against a real Postgres.
describe("GET /v1/leagues", () => {
  it("wraps the query result in the envelope with the expected cache header", async () => {
    const leagues: League[] = [
      {
        id: "l1",
        name: "NBA",
        country: "USA",
        logo_url: null,
        priority: 0,
        current_season_id: "s1",
      },
    ];
    const app = makeApp(async () => ({ leagues, delayed: false }));

    const res = await request(app).get("/v1/leagues");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.data).toEqual(leagues);
    expect(res.body.meta.delayed).toBe(false);
  });

  it("surfaces delayed:true from the query result", async () => {
    const app = makeApp(async () => ({ leagues: [], delayed: true }));

    const res = await request(app).get("/v1/leagues");

    expect(res.body.meta.delayed).toBe(true);
  });
});
