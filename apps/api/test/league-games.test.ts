import { db, game, league, season, team } from "@hooply/db";
import { leagueGamesResponseSchema } from "@hooply/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

async function resetTables() {
  await db.delete(game);
  await db.delete(team);
  await db.delete(season);
  await db.delete(league);
}

async function seedLeagueSeasonTeams() {
  const [nba] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "lg-12",
      name: "NBA",
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
    })
    .returning();
  const [euroleague] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "lg-120",
      name: "Euroleague",
      priority: 1,
      isActive: true,
      quarterDurationMins: 10,
      otDurationMins: 5,
    })
    .returning();
  if (!nba || !euroleague) throw new Error("expected leagues to be inserted");

  const [nbaSeason] = await db
    .insert(season)
    .values({ leagueId: nba.id, providerRef: "2025-2026", label: "2025-2026", isCurrent: true })
    .returning();
  const [euroSeason] = await db
    .insert(season)
    .values({ leagueId: euroleague.id, providerRef: "2025", label: "2025", isCurrent: true })
    .returning();
  if (!nbaSeason || !euroSeason) throw new Error("expected seasons to be inserted");

  const teamRows = await db
    .insert(team)
    .values([
      { provider: "api-sports", providerRef: "lg-1", name: "Lakers", code: "LAL", logoUrl: null },
      { provider: "api-sports", providerRef: "lg-2", name: "Celtics", code: "BOS", logoUrl: null },
    ])
    .returning();
  const [lakers, celtics] = teamRows;
  if (!lakers || !celtics) throw new Error("expected 2 teams to be inserted");

  return { nba, euroleague, nbaSeason, euroSeason, lakers, celtics };
}

describe("GET /v1/leagues/:id/games", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns fixtures for the league within [from, to], ordered by tipoff, excluding other leagues and out-of-range dates", async () => {
    const { nba, euroleague, nbaSeason, euroSeason, lakers, celtics } =
      await seedLeagueSeasonTeams();

    await db.insert(game).values([
      {
        provider: "api-sports",
        providerRef: "lg-g1",
        seasonId: nbaSeason.id,
        leagueId: nba.id,
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-07-05T02:00:00Z"),
        status: "final",
        homeScore: 90,
        awayScore: 88,
        updatedAt: new Date(),
      },
      {
        provider: "api-sports",
        providerRef: "lg-g2",
        seasonId: nbaSeason.id,
        leagueId: nba.id,
        homeTeamId: celtics.id,
        awayTeamId: lakers.id,
        tipoffAt: new Date("2026-07-10T02:00:00Z"),
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        updatedAt: new Date(),
      },
      {
        // outside the requested range
        provider: "api-sports",
        providerRef: "lg-g3",
        seasonId: nbaSeason.id,
        leagueId: nba.id,
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-08-01T02:00:00Z"),
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        updatedAt: new Date(),
      },
      {
        // a different league entirely
        provider: "api-sports",
        providerRef: "lg-g4",
        seasonId: euroSeason.id,
        leagueId: euroleague.id,
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-07-07T18:00:00Z"),
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        updatedAt: new Date(),
      },
    ]);

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/games?from=2026-07-01&to=2026-07-10`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");

    const parsed = leagueGamesResponseSchema.parse(res.body);
    expect(parsed.data.map((g) => g.status)).toEqual(["final", "scheduled"]);
    expect(parsed.data[0]?.home.team.code).toBe("LAL");
  });

  it("returns an empty list when the league has no fixtures in range", async () => {
    const { nba } = await seedLeagueSeasonTeams();
    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/games?from=2026-01-01&to=2026-01-07`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("404s for a league that doesn't exist", async () => {
    const app = createApp();
    const res = await request(app).get(
      "/v1/leagues/00000000-0000-0000-0000-000000000000/games?from=2026-07-01&to=2026-07-07",
    );
    expect(res.status).toBe(404);
  });

  it("400s when from/to are missing or malformed", async () => {
    const { nba } = await seedLeagueSeasonTeams();
    const app = createApp();

    const missing = await request(app).get(`/v1/leagues/${nba.id}/games`);
    expect(missing.status).toBe(400);

    const malformed = await request(app).get(
      `/v1/leagues/${nba.id}/games?from=07-01-2026&to=2026-07-07`,
    );
    expect(malformed.status).toBe(400);
  });

  it("400s when from is after to", async () => {
    const { nba } = await seedLeagueSeasonTeams();
    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/games?from=2026-07-10&to=2026-07-01`);
    expect(res.status).toBe(400);
  });

  it("marks the response delayed when a live game hasn't updated in over 60s", async () => {
    const { nba, nbaSeason, lakers, celtics } = await seedLeagueSeasonTeams();
    const staleDate = new Date(Date.now() - 90 * 1000);

    await db.insert(game).values({
      provider: "api-sports",
      providerRef: "lg-g5",
      seasonId: nbaSeason.id,
      leagueId: nba.id,
      homeTeamId: lakers.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-07-05T02:00:00Z"),
      status: "live",
      period: 2,
      clock: "05:00",
      homeScore: 40,
      awayScore: 38,
      updatedAt: staleDate,
    });

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/games?from=2026-07-01&to=2026-07-10`);
    expect(res.body.meta.delayed).toBe(true);
  });
});
