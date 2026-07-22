import type { Game, RosterPlayer, TeamProfile } from "@hooply/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTeamsRouter } from "../src/routes/teams";

function notImplemented(name: string) {
  return async () => {
    throw new Error(`${name} should not have been called`);
  };
}

type TeamGamesWindow = "upcoming" | "past";

const TEAM_ID = "33333333-3333-3333-3333-333333333333";

function makeApp(
  overrides: {
    getTeamById?: (id: string) => Promise<TeamProfile | null>;
    getTeamGames?: (id: string, window: TeamGamesWindow, limit: number) => Promise<Game[] | null>;
    getTeamRoster?: (id: string) => Promise<RosterPlayer[] | null>;
  } = {},
) {
  const app = express();
  app.use(
    "/v1/teams",
    createTeamsRouter({
      getTeamById: overrides.getTeamById ?? notImplemented("getTeamById"),
      getTeamGames: overrides.getTeamGames ?? notImplemented("getTeamGames"),
      getTeamRoster: overrides.getTeamRoster ?? notImplemented("getTeamRoster"),
    }),
  );
  return app;
}

function makeTeamProfile(overrides: Partial<TeamProfile> = {}): TeamProfile {
  return {
    id: TEAM_ID,
    name: "Thunder",
    code: "OKC",
    logo_url: null,
    country: "USA",
    league: { id: "l1", name: "NBA" },
    standing: { rank: 3, conference: "West", group_name: null, wins: 42, losses: 18 },
    ...overrides,
  };
}

// Fast unit tests against a fake query module — the real join/serialization
// behavior lives in packages/db/test/queries/teams.test.ts against a real
// Postgres. These routes only own 404/400 branching, param parsing, and
// envelope wrapping.
describe("GET /v1/teams/:id", () => {
  it("404s for a team that doesn't exist", async () => {
    const app = makeApp({ getTeamById: async () => null });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("passes the id to the query, caches for an hour, and wraps the result in the envelope", async () => {
    const profile = makeTeamProfile();
    let receivedId: string | undefined;
    const app = makeApp({
      getTeamById: async (id) => {
        receivedId = id;
        return profile;
      },
    });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}`);

    expect(receivedId).toBe(TEAM_ID);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.data).toEqual(profile);
  });

  it("renders league/standing null for a team with no current-season standing yet", async () => {
    const profile = makeTeamProfile({ league: null, standing: null });
    const app = makeApp({ getTeamById: async () => profile });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}`);

    expect(res.body.data.league).toBeNull();
    expect(res.body.data.standing).toBeNull();
  });
});

describe("GET /v1/teams/:id/games", () => {
  it("400s when ?window= is missing or invalid", async () => {
    const app = makeApp();

    const missing = await request(app).get(`/v1/teams/${TEAM_ID}/games`);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("bad_request");

    const invalid = await request(app).get(`/v1/teams/${TEAM_ID}/games?window=sideways`);
    expect(invalid.status).toBe(400);
  });

  it("400s when ?limit= isn't a positive integer", async () => {
    const app = makeApp();

    const res = await request(app).get(`/v1/teams/${TEAM_ID}/games?window=upcoming&limit=-1`);

    expect(res.status).toBe(400);
  });

  it("404s for a team that doesn't exist", async () => {
    const app = makeApp({ getTeamGames: async () => null });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}/games?window=upcoming`);

    expect(res.status).toBe(404);
  });

  it("defaults limit to 10 and passes window/limit through to the query", async () => {
    let received: { window?: TeamGamesWindow; limit?: number } = {};
    const app = makeApp({
      getTeamGames: async (_id, window, limit) => {
        received = { window, limit };
        return [];
      },
    });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}/games?window=past`);

    expect(received).toEqual({ window: "past", limit: 10 });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("passes an explicit limit through to the query", async () => {
    let receivedLimit: number | undefined;
    const app = makeApp({
      getTeamGames: async (_id, _window, limit) => {
        receivedLimit = limit;
        return [];
      },
    });

    await request(app).get(`/v1/teams/${TEAM_ID}/games?window=upcoming&limit=5`);

    expect(receivedLimit).toBe(5);
  });
});

describe("GET /v1/teams/:id/roster", () => {
  it("404s for a team that doesn't exist", async () => {
    const app = makeApp({ getTeamRoster: async () => null });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}/roster`);

    expect(res.status).toBe(404);
  });

  it("passes the id to the query, caches for an hour, and wraps the result in the envelope", async () => {
    const roster: RosterPlayer[] = [
      { id: "p1", full_name: "Guard One", position: "Guard", jersey_number: 5 },
    ];
    let receivedId: string | undefined;
    const app = makeApp({
      getTeamRoster: async (id) => {
        receivedId = id;
        return roster;
      },
    });

    const res = await request(app).get(`/v1/teams/${TEAM_ID}/roster`);

    expect(receivedId).toBe(TEAM_ID);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    expect(res.body.data).toEqual(roster);
  });

  it("400s when ?season= isn't a well-formed uuid, without calling the query", async () => {
    const app = makeApp();

    const res = await request(app).get(`/v1/teams/${TEAM_ID}/roster?season=not-a-uuid`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("accepts a well-formed ?season= even though it isn't filtered on yet", async () => {
    const roster: RosterPlayer[] = [];
    const app = makeApp({ getTeamRoster: async () => roster });

    const res = await request(app).get(
      `/v1/teams/${TEAM_ID}/roster?season=55555555-5555-5555-5555-555555555555`,
    );

    expect(res.status).toBe(200);
  });
});
