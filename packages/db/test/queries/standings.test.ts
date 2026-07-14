import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import {
  getCurrentSeason,
  getSeasonById,
  getStandingsForSeason,
} from "../../src/queries/standings";
import { league, season, standing, team } from "../../src/schema/index";

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

describe("getStandingsForSeason", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("groups by conference when present", async () => {
    const { currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();

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

    const result = await getStandingsForSeason(currentSeason.id);

    expect(result.standings.map((g) => g.label)).toEqual(["East", "West"]);

    const west = result.standings.find((g) => g.label === "West");
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

    const east = result.standings.find((g) => g.label === "East");
    expect(east?.standings[0]?.games_behind).toBe(1);
    expect(result.delayed).toBe(false);
  });

  it("returns a single ungrouped group (label null) for a flat league", async () => {
    const { currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();

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

    const result = await getStandingsForSeason(currentSeason.id);

    expect(result.standings).toHaveLength(1);
    expect(result.standings[0]?.label).toBeNull();
    expect(result.standings[0]?.standings.map((s) => s.rank)).toEqual([1, 2]);
  });

  it("marks the response delayed when standings haven't updated in over 6h", async () => {
    const { currentSeason, thunder } = await seedLeagueSeasonTeams();
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

    const result = await getStandingsForSeason(currentSeason.id);

    expect(result.delayed).toBe(true);
  });
});

describe("getCurrentSeason / getSeasonById", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("getCurrentSeason resolves the season flagged is_current for the league", async () => {
    const { nba, currentSeason } = await seedLeagueSeasonTeams();

    const result = await getCurrentSeason(nba.id);

    expect(result?.id).toBe(currentSeason.id);
  });

  it("getCurrentSeason returns null when no current season has been seeded yet", async () => {
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

    const result = await getCurrentSeason(league2.id);

    expect(result).toBeNull();
  });

  it("getSeasonById finds a non-current season by id, scoped to the league", async () => {
    const { nba, pastSeason } = await seedLeagueSeasonTeams();

    const result = await getSeasonById(pastSeason.id, nba.id);

    expect(result?.id).toBe(pastSeason.id);
  });

  it("getSeasonById returns null when the season belongs to a different league", async () => {
    const { pastSeason } = await seedLeagueSeasonTeams();

    const result = await getSeasonById(pastSeason.id, "00000000-0000-0000-0000-000000000000");

    expect(result).toBeNull();
  });
});
