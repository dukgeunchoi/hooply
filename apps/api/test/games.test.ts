import type { LeagueGames } from "@hooply/shared";
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
  getGamesForDate: (
    date: string,
  ) => Promise<{ leagues: LeagueGames[]; delayed: boolean }> = notImplemented("getGamesForDate"),
) {
  const app = express();
  app.use("/v1/games", createGamesRouter({ getGamesForDate }));
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
    const app = makeApp(async (date) => {
      receivedDate = date;
      return { leagues, delayed: false };
    });

    const res = await request(app).get("/v1/games?date=2026-07-07");

    expect(receivedDate).toBe("2026-07-07");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.body.data).toEqual(leagues);
    expect(res.body.meta.delayed).toBe(false);
  });

  it("surfaces delayed:true from the query result", async () => {
    const app = makeApp(async () => ({ leagues: [], delayed: true }));

    const res = await request(app).get("/v1/games?date=2026-07-07");

    expect(res.body.meta.delayed).toBe(true);
  });
});
