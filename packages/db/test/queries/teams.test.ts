import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import { getTeamById, getTeamGames, getTeamRoster } from "../../src/queries/teams";
import { game, league, player, season, standing, team } from "../../src/schema/index";

async function resetTables() {
  await db.delete(player);
  await db.delete(standing);
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
      providerRef: "tm-12",
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
      {
        provider: "api-sports",
        providerRef: "tm-1",
        name: "Thunder",
        code: "OKC",
        logoUrl: null,
        country: "USA",
      },
      { provider: "api-sports", providerRef: "tm-2", name: "Celtics", code: "BOS", logoUrl: null },
    ])
    .returning();
  const [thunder, celtics] = teamRows;
  if (!thunder || !celtics) throw new Error("expected 2 teams to be inserted");

  return { nba, currentSeason, pastSeason, thunder, celtics };
}

describe("getTeamById", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns null for a malformed (non-uuid) id", async () => {
    expect(await getTeamById("not-a-uuid")).toBeNull();
  });

  it("returns null for a team that doesn't exist", async () => {
    expect(await getTeamById("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("returns the profile with league/standing null when no current-season standing exists yet", async () => {
    const { thunder } = await seedLeagueSeasonTeams();

    const result = await getTeamById(thunder.id);

    expect(result).toEqual({
      id: thunder.id,
      name: "Thunder",
      code: "OKC",
      logo_url: null,
      country: "USA",
      league: null,
      standing: null,
    });
  });

  it("includes league + standing summary once a current-season standing row exists", async () => {
    const { nba, currentSeason, thunder } = await seedLeagueSeasonTeams();

    await db.insert(standing).values({
      seasonId: currentSeason.id,
      teamId: thunder.id,
      rank: 3,
      played: 60,
      wins: 42,
      losses: 18,
      winPct: "0.700",
      pointsFor: 6500,
      pointsAgainst: 6100,
      streak: "W4",
      gamesBehind: null,
      conference: "West",
      groupName: null,
      updatedAt: new Date(),
    });

    const result = await getTeamById(thunder.id);

    expect(result?.league).toEqual({ id: nba.id, name: "NBA" });
    expect(result?.standing).toEqual({
      rank: 3,
      conference: "West",
      group_name: null,
      wins: 42,
      losses: 18,
    });
  });

  it("ignores a standing row from a non-current season", async () => {
    const { pastSeason, thunder } = await seedLeagueSeasonTeams();

    await db.insert(standing).values({
      seasonId: pastSeason.id,
      teamId: thunder.id,
      rank: 5,
      played: 82,
      wins: 40,
      losses: 42,
      winPct: "0.488",
      pointsFor: 8000,
      pointsAgainst: 8000,
      streak: null,
      gamesBehind: null,
      conference: "West",
      groupName: null,
      updatedAt: new Date(),
    });

    const result = await getTeamById(thunder.id);

    expect(result?.standing).toBeNull();
  });

  it("treats a retired alias (canonical_id set) as not found", async () => {
    const { thunder, celtics } = await seedLeagueSeasonTeams();
    await db.update(team).set({ canonicalId: celtics.id }).where(eq(team.id, thunder.id));

    expect(await getTeamById(thunder.id)).toBeNull();
  });
});

describe("getTeamGames", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns null for a team that doesn't exist", async () => {
    expect(await getTeamGames("11111111-1111-1111-1111-111111111111", "upcoming", 10)).toBeNull();
  });

  it("splits on tipoff time relative to `now`, ordered ascending for upcoming / descending for past", async () => {
    const { nba, currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();
    const now = new Date("2026-03-01T00:00:00Z");

    await db.insert(game).values([
      {
        provider: "api-sports",
        providerRef: "tm-g1",
        seasonId: currentSeason.id,
        leagueId: nba.id,
        homeTeamId: thunder.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-02-20T00:00:00Z"), // past
        status: "final",
        homeScore: 101,
        awayScore: 98,
        updatedAt: now,
      },
      {
        provider: "api-sports",
        providerRef: "tm-g2",
        seasonId: currentSeason.id,
        leagueId: nba.id,
        homeTeamId: celtics.id,
        awayTeamId: thunder.id,
        tipoffAt: new Date("2026-02-25T00:00:00Z"), // past, more recent
        status: "final",
        homeScore: 90,
        awayScore: 95,
        updatedAt: now,
      },
      {
        provider: "api-sports",
        providerRef: "tm-g3",
        seasonId: currentSeason.id,
        leagueId: nba.id,
        homeTeamId: thunder.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-03-05T00:00:00Z"), // upcoming
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        updatedAt: now,
      },
      {
        provider: "api-sports",
        providerRef: "tm-g4",
        // A game not involving this team — must never appear.
        seasonId: currentSeason.id,
        leagueId: nba.id,
        homeTeamId: celtics.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-03-06T00:00:00Z"),
        status: "scheduled",
        homeScore: 0,
        awayScore: 0,
        updatedAt: now,
      },
    ]);

    const past = await getTeamGames(thunder.id, "past", 10, now);
    expect(past?.map((g) => g.id)).toHaveLength(2);
    // Most recent past game first.
    expect(past?.[0]?.home.score).toBe(90);

    const upcoming = await getTeamGames(thunder.id, "upcoming", 10, now);
    expect(upcoming).toHaveLength(1);
    expect(upcoming?.[0]?.status).toBe("scheduled");
  });

  it("respects the limit", async () => {
    const { nba, currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();
    const now = new Date("2026-03-01T00:00:00Z");

    await db.insert(game).values(
      Array.from({ length: 3 }, (_, i) => ({
        provider: "api-sports",
        providerRef: `tm-limit-${i}`,
        seasonId: currentSeason.id,
        leagueId: nba.id,
        homeTeamId: thunder.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000),
        status: "final" as const,
        homeScore: 100,
        awayScore: 90,
        updatedAt: now,
      })),
    );

    const past = await getTeamGames(thunder.id, "past", 2, now);
    expect(past).toHaveLength(2);
  });
});

describe("getTeamRoster", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns null for a team that doesn't exist", async () => {
    expect(await getTeamRoster("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("returns players sorted by position then jersey number", async () => {
    const { thunder } = await seedLeagueSeasonTeams();

    await db.insert(player).values([
      {
        provider: "api-sports",
        providerRef: "tm-p1",
        teamId: thunder.id,
        fullName: "Center Guy",
        position: "Center",
        jerseyNumber: 11,
      },
      {
        provider: "api-sports",
        providerRef: "tm-p2",
        teamId: thunder.id,
        fullName: "Guard Two",
        position: "Guard",
        jerseyNumber: 24,
      },
      {
        provider: "api-sports",
        providerRef: "tm-p3",
        teamId: thunder.id,
        fullName: "Guard One",
        position: "Guard",
        jerseyNumber: 5,
      },
    ]);

    const roster = await getTeamRoster(thunder.id);

    // Grouped by position (alphabetically: Center before Guard), jersey
    // number ascending within each group — the mobile Roster tab is free to
    // re-order the groups themselves for display.
    expect(roster?.map((p) => p.full_name)).toEqual(["Center Guy", "Guard One", "Guard Two"]);
  });

  it("excludes a retired alias row (canonical_id set) and players on other teams", async () => {
    const { thunder, celtics } = await seedLeagueSeasonTeams();

    const [aliasPlayer] = await db
      .insert(player)
      .values({
        provider: "api-sports",
        providerRef: "tm-p-alias",
        teamId: thunder.id,
        fullName: "Old Alias",
      })
      .returning();
    if (!aliasPlayer) throw new Error("expected alias player to be inserted");

    const [realPlayer] = await db
      .insert(player)
      .values({
        provider: "api-sports",
        providerRef: "tm-p-canonical",
        teamId: thunder.id,
        fullName: "Real Player",
      })
      .returning();
    if (!realPlayer) throw new Error("expected real player to be inserted");

    await db.insert(player).values({
      provider: "api-sports",
      providerRef: "tm-p-other-team",
      teamId: celtics.id,
      fullName: "Other Team Player",
    });
    await db
      .update(player)
      .set({ canonicalId: realPlayer.id })
      .where(eq(player.id, aliasPlayer.id));

    const roster = await getTeamRoster(thunder.id);

    expect(roster?.map((p) => p.full_name)).toEqual(["Real Player"]);
  });
});
