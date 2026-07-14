import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import { getActiveLeagues, getLeagueById } from "../../src/queries/leagues";
import { league, season } from "../../src/schema/index";

async function resetLeagueTables() {
  await db.delete(season);
  await db.delete(league);
}

describe("getActiveLeagues", () => {
  beforeEach(resetLeagueTables);
  afterAll(resetLeagueTables);

  it("returns active leagues ordered by priority with current_season_id", async () => {
    const [nba] = await db
      .insert(league)
      .values({
        provider: "api-sports",
        providerRef: "12",
        name: "NBA",
        country: "USA",
        logoUrl: "https://media.api-sports.io/basketball/leagues/12.png",
        priority: 0,
        isActive: true,
        quarterDurationMins: 12,
        otDurationMins: 5,
        updatedAt: new Date(),
      })
      .returning();
    await db.insert(league).values({
      provider: "api-sports",
      providerRef: "120",
      name: "Euroleague",
      country: "Europe",
      logoUrl: null,
      priority: 1,
      isActive: true,
      quarterDurationMins: 10,
      otDurationMins: 5,
      updatedAt: new Date(),
    });
    await db.insert(league).values({
      provider: "api-sports",
      providerRef: "999",
      name: "Inactive League",
      country: null,
      logoUrl: null,
      priority: 5,
      isActive: false,
      quarterDurationMins: 10,
      otDurationMins: 5,
      updatedAt: new Date(),
    });
    if (!nba) throw new Error("expected NBA row to be inserted");

    const [currentSeason] = await db
      .insert(season)
      .values({
        leagueId: nba.id,
        providerRef: "2025-2026",
        label: "2025-2026",
        startsOn: "2025-10-02",
        endsOn: "2026-06-14",
        isCurrent: true,
      })
      .returning();
    if (!currentSeason) throw new Error("expected season row to be inserted");

    const result = await getActiveLeagues();

    expect(result.leagues.map((l) => l.name)).toEqual(["NBA", "Euroleague"]);
    expect(result.leagues[0]?.current_season_id).toBe(currentSeason.id);
    expect(result.leagues[1]?.current_season_id).toBeNull();
    expect(result.delayed).toBe(false);
  });

  it("marks the response delayed when league data is stale", async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.insert(league).values({
      provider: "api-sports",
      providerRef: "12",
      name: "NBA",
      country: "USA",
      logoUrl: null,
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
      updatedAt: staleDate,
    });

    const result = await getActiveLeagues();

    expect(result.delayed).toBe(true);
  });

  it("is delayed when even one league among several is stale", async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db.insert(league).values({
      provider: "api-sports",
      providerRef: "12",
      name: "NBA",
      country: "USA",
      logoUrl: null,
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
      updatedAt: new Date(),
    });
    await db.insert(league).values({
      provider: "api-sports",
      providerRef: "120",
      name: "Euroleague",
      country: "Europe",
      logoUrl: null,
      priority: 1,
      isActive: true,
      quarterDurationMins: 10,
      otDurationMins: 5,
      updatedAt: staleDate,
    });

    const result = await getActiveLeagues();

    expect(result.delayed).toBe(true);
  });

  it("is not delayed immediately after a fresh ingestion", async () => {
    await db.insert(league).values({
      provider: "api-sports",
      providerRef: "12",
      name: "NBA",
      country: "USA",
      logoUrl: null,
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
      updatedAt: new Date(),
    });

    const result = await getActiveLeagues();

    expect(result.delayed).toBe(false);
  });

  it("breaks ties on priority deterministically instead of leaving order unspecified", async () => {
    const inserted = await db
      .insert(league)
      .values([
        {
          provider: "api-sports",
          providerRef: "120",
          name: "Euroleague",
          country: "Europe",
          logoUrl: null,
          priority: 0,
          isActive: true,
          quarterDurationMins: 10,
          otDurationMins: 5,
          updatedAt: new Date(),
        },
        {
          provider: "api-sports",
          providerRef: "12",
          name: "NBA",
          country: "USA",
          logoUrl: null,
          priority: 0,
          isActive: true,
          quarterDurationMins: 12,
          otDurationMins: 5,
          updatedAt: new Date(),
        },
      ])
      .returning();

    const expectedIds = [...inserted].map((l) => l.id).sort();

    const results = await Promise.all(Array.from({ length: 5 }, () => getActiveLeagues()));

    // Same tied priority on both rows: order must be pinned by id (see #26).
    for (const result of results) {
      expect(result.leagues.map((l) => l.id)).toEqual(expectedIds);
    }
  });
});

describe("getLeagueById", () => {
  beforeEach(resetLeagueTables);
  afterAll(resetLeagueTables);

  it("returns the league when the id exists", async () => {
    const [nba] = await db
      .insert(league)
      .values({
        provider: "api-sports",
        providerRef: "12",
        name: "NBA",
        priority: 0,
        isActive: true,
        quarterDurationMins: 12,
        otDurationMins: 5,
      })
      .returning();
    if (!nba) throw new Error("expected NBA row to be inserted");

    const result = await getLeagueById(nba.id);

    expect(result?.id).toBe(nba.id);
  });

  it("returns null for a well-formed but nonexistent uuid", async () => {
    const result = await getLeagueById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("returns null instead of throwing for a malformed id", async () => {
    const result = await getLeagueById("not-a-uuid");
    expect(result).toBeNull();
  });
});
