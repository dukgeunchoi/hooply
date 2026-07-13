import { db, league, season } from "@hooply/db";
import { leaguesResponseSchema } from "@hooply/shared";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

async function resetLeagueTables() {
  await db.delete(season);
  await db.delete(league);
}

describe("GET /v1/leagues", () => {
  beforeEach(resetLeagueTables);
  afterAll(resetLeagueTables);

  it("returns active leagues ordered by priority with current_season_id, matching the envelope schema", async () => {
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

    const app = createApp();
    const res = await request(app).get("/v1/leagues");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");

    const parsed = leaguesResponseSchema.parse(res.body);
    expect(parsed.data.map((l) => l.name)).toEqual(["NBA", "Euroleague"]);
    expect(parsed.data[0]?.current_season_id).toBe(currentSeason.id);
    expect(parsed.data[1]?.current_season_id).toBeNull();
    expect(parsed.meta.delayed).toBe(false);
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

    const app = createApp();
    const res = await request(app).get("/v1/leagues");

    expect(res.body.meta.delayed).toBe(true);
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

    const app = createApp();
    const res = await request(app).get("/v1/leagues");

    expect(res.body.meta.delayed).toBe(true);
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

    const app = createApp();
    const res = await request(app).get("/v1/leagues");

    expect(res.body.meta.delayed).toBe(false);
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

    const app = createApp();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get("/v1/leagues")),
    );

    // Same tied priority on both rows: order must be pinned by id (see the
    // orderBy comment in routes/leagues.ts).
    for (const res of results) {
      const parsed = leaguesResponseSchema.parse(res.body);
      expect(parsed.data.map((l) => l.id)).toEqual(expectedIds);
    }
  });
});
