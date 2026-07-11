import { db, league, season, standing, team } from "@hooply/db";
import { standingsResponseSchema } from "@hooply/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

async function resetTables() {
  await db.delete(standing);
  await db.delete(team);
  await db.delete(season);
  await db.delete(league);
}

async function seedLeagueSeasonTeams() {
  const [nba] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "st-12",
      name: "NBA",
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
    })
    .returning();
  if (!nba) throw new Error("expected NBA league to be inserted");

  const [currentSeason] = await db
    .insert(season)
    .values({ leagueId: nba.id, providerRef: "2025-2026", label: "2025-2026", isCurrent: true })
    .returning();
  const [pastSeason] = await db
    .insert(season)
    .values({ leagueId: nba.id, providerRef: "2024-2025", label: "2024-2025", isCurrent: false })
    .returning();
  if (!currentSeason || !pastSeason) throw new Error("expected seasons to be inserted");

  const teamRows = await db
    .insert(team)
    .values([
      { provider: "api-sports", providerRef: "st-1", name: "Thunder", code: "OKC", logoUrl: null },
      { provider: "api-sports", providerRef: "st-2", name: "Celtics", code: "BOS", logoUrl: null },
    ])
    .returning();
  const [thunder, celtics] = teamRows;
  if (!thunder || !celtics) throw new Error("expected 2 teams to be inserted");

  return { nba, currentSeason, pastSeason, thunder, celtics };
}

describe("GET /v1/leagues/:id/standings", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("defaults to the current season and groups by conference when present", async () => {
    const { nba, currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();

    await db.insert(standing).values([
      {
        seasonId: currentSeason.id,
        teamId: thunder.id,
        rank: 1,
        played: 10,
        wins: 8,
        losses: 2,
        winPct: "0.800",
        pointsFor: 1100,
        pointsAgainst: 1000,
        streak: "W3",
        gamesBehind: null,
        conference: "West",
        groupName: null,
        updatedAt: new Date(),
      },
      {
        seasonId: currentSeason.id,
        teamId: celtics.id,
        rank: 1,
        played: 10,
        wins: 7,
        losses: 3,
        winPct: "0.700",
        pointsFor: 1050,
        pointsAgainst: 990,
        streak: "L1",
        gamesBehind: "1.0",
        conference: "East",
        groupName: null,
        updatedAt: new Date(),
      },
    ]);

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/standings`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");

    const parsed = standingsResponseSchema.parse(res.body);
    expect(parsed.data.map((g) => g.label)).toEqual(["East", "West"]);

    const west = parsed.data.find((g) => g.label === "West");
    expect(west?.standings[0]).toEqual({
      rank: 1,
      team: { id: thunder.id, name: "Thunder", code: "OKC", logo_url: null },
      played: 10,
      wins: 8,
      losses: 2,
      win_pct: 0.8,
      points_for: 1100,
      points_against: 1000,
      games_behind: null,
      streak: "W3",
    });

    const east = parsed.data.find((g) => g.label === "East");
    expect(east?.standings[0]?.games_behind).toBe(1);
    expect(parsed.meta.delayed).toBe(false);
  });

  it("returns a single ungrouped group (label null) for a flat league", async () => {
    const { nba, currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();

    await db.insert(standing).values([
      {
        seasonId: currentSeason.id,
        teamId: thunder.id,
        rank: 1,
        played: 5,
        wins: 4,
        losses: 1,
        winPct: "0.800",
        pointsFor: 500,
        pointsAgainst: 450,
        streak: null,
        gamesBehind: null,
        conference: null,
        groupName: null,
        updatedAt: new Date(),
      },
      {
        seasonId: currentSeason.id,
        teamId: celtics.id,
        rank: 2,
        played: 5,
        wins: 3,
        losses: 2,
        winPct: "0.600",
        pointsFor: 480,
        pointsAgainst: 470,
        streak: null,
        gamesBehind: "1.0",
        conference: null,
        groupName: null,
        updatedAt: new Date(),
      },
    ]);

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/standings`);

    const parsed = standingsResponseSchema.parse(res.body);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]?.label).toBeNull();
    expect(parsed.data[0]?.standings.map((s) => s.rank)).toEqual([1, 2]);
  });

  it("uses an explicit ?season= param instead of the current season", async () => {
    const { nba, pastSeason, thunder } = await seedLeagueSeasonTeams();

    await db.insert(standing).values({
      seasonId: pastSeason.id,
      teamId: thunder.id,
      rank: 3,
      played: 82,
      wins: 40,
      losses: 42,
      winPct: "0.488",
      pointsFor: 9000,
      pointsAgainst: 9100,
      streak: null,
      gamesBehind: null,
      conference: null,
      groupName: null,
      updatedAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/standings?season=${pastSeason.id}`);

    const parsed = standingsResponseSchema.parse(res.body);
    expect(parsed.data[0]?.standings[0]?.rank).toBe(3);
  });

  it("returns an empty list when no current season has been seeded yet", async () => {
    const [league2] = await db
      .insert(league)
      .values({
        provider: "api-sports",
        providerRef: "st-empty",
        name: "Empty League",
        priority: 9,
        isActive: true,
        quarterDurationMins: 10,
        otDurationMins: 5,
      })
      .returning();
    if (!league2) throw new Error("expected league to be inserted");

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${league2.id}/standings`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("404s for a league that doesn't exist", async () => {
    const app = createApp();
    const res = await request(app).get(
      "/v1/leagues/00000000-0000-0000-0000-000000000000/standings",
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("400s when ?season= doesn't belong to the requested league", async () => {
    const { nba } = await seedLeagueSeasonTeams();
    const app = createApp();
    const res = await request(app).get(
      `/v1/leagues/${nba.id}/standings?season=00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });

  it("marks the response delayed when standings haven't updated in over 6h", async () => {
    const { nba, currentSeason, thunder } = await seedLeagueSeasonTeams();
    const staleDate = new Date(Date.now() - 7 * 60 * 60 * 1000);

    await db.insert(standing).values({
      seasonId: currentSeason.id,
      teamId: thunder.id,
      rank: 1,
      played: 1,
      wins: 1,
      losses: 0,
      winPct: "1.000",
      pointsFor: 100,
      pointsAgainst: 90,
      streak: null,
      gamesBehind: null,
      conference: null,
      groupName: null,
      updatedAt: staleDate,
    });

    const app = createApp();
    const res = await request(app).get(`/v1/leagues/${nba.id}/standings`);
    expect(res.body.meta.delayed).toBe(true);
  });
});
