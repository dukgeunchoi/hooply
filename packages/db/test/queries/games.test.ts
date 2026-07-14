import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import { getGamesForDate } from "../../src/queries/games";
import { game, league, season, team } from "../../src/schema/index";

async function resetTables() {
  await db.delete(game);
  await db.delete(team);
  await db.delete(season);
  await db.delete(league);
}

async function seedLeagueAndTeams() {
  const [nba] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "12",
      name: "NBA",
      logoUrl: "https://media/nba.png",
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
    })
    .returning();
  if (!nba) throw new Error("expected NBA league to be inserted");

  const [euroleague] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "120",
      name: "Euroleague",
      logoUrl: null,
      priority: 1,
      isActive: true,
      quarterDurationMins: 10,
      otDurationMins: 5,
    })
    .returning();
  if (!euroleague) throw new Error("expected Euroleague league to be inserted");

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
      { provider: "api-sports", providerRef: "1", name: "Lakers", code: "LAL", logoUrl: null },
      { provider: "api-sports", providerRef: "2", name: "Celtics", code: "BOS", logoUrl: null },
      { provider: "api-sports", providerRef: "3", name: "Alba Berlin", code: "ALB", logoUrl: null },
      { provider: "api-sports", providerRef: "4", name: "Monaco", code: "MCO", logoUrl: null },
    ])
    .returning();
  const [lakers, celtics, alba, monaco] = teamRows;
  if (!lakers || !celtics || !alba || !monaco) throw new Error("expected 4 teams to be inserted");

  return { nba, euroleague, nbaSeason, euroSeason, lakers, celtics, alba, monaco };
}

describe("getGamesForDate", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns games for the date grouped by league, ordered by priority then tipoff", async () => {
    const { nba, euroleague, nbaSeason, euroSeason, lakers, celtics, alba, monaco } =
      await seedLeagueAndTeams();

    await db.insert(game).values([
      {
        provider: "api-sports",
        providerRef: "g1",
        seasonId: nbaSeason.id,
        leagueId: nba.id,
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-07-07T02:00:00Z"),
        status: "final",
        period: null,
        clock: null,
        homeScore: 78,
        awayScore: 71,
        venue: "Crypto.com Arena",
        updatedAt: new Date(),
      },
      {
        provider: "api-sports",
        providerRef: "g2",
        seasonId: nbaSeason.id,
        leagueId: nba.id,
        homeTeamId: celtics.id,
        awayTeamId: lakers.id,
        tipoffAt: new Date("2026-07-07T23:00:00Z"),
        status: "scheduled",
        period: null,
        clock: null,
        homeScore: 0,
        awayScore: 0,
        venue: "TD Garden",
        updatedAt: new Date(),
      },
      {
        provider: "api-sports",
        providerRef: "g3",
        seasonId: euroSeason.id,
        leagueId: euroleague.id,
        homeTeamId: alba.id,
        awayTeamId: monaco.id,
        tipoffAt: new Date("2026-07-07T18:00:00Z"),
        status: "live",
        period: 3,
        clock: "07:42",
        homeScore: 55,
        awayScore: 60,
        venue: "Mercedes-Benz Arena",
        updatedAt: new Date(),
      },
      {
        // A different date — must not appear in the response.
        provider: "api-sports",
        providerRef: "g4",
        seasonId: nbaSeason.id,
        leagueId: nba.id,
        homeTeamId: lakers.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date("2026-07-08T02:00:00Z"),
        status: "scheduled",
        period: null,
        clock: null,
        homeScore: 0,
        awayScore: 0,
        venue: null,
        updatedAt: new Date(),
      },
    ]);

    const result = await getGamesForDate("2026-07-07");

    expect(result.leagues.map((g) => g.league.name)).toEqual(["NBA", "Euroleague"]);

    const nbaGroup = result.leagues.find((g) => g.league.name === "NBA");
    expect(nbaGroup?.games).toHaveLength(2);
    // Ordered by tipoff_at ascending within the league.
    expect(nbaGroup?.games.map((g) => g.status)).toEqual(["final", "scheduled"]);

    const finalGame = nbaGroup?.games[0];
    expect(finalGame?.home).toEqual({
      team: { id: lakers.id, name: "Lakers", code: "LAL", logo_url: null },
      score: 78,
    });
    expect(finalGame?.away.score).toBe(71);

    const euroGroup = result.leagues.find((g) => g.league.name === "Euroleague");
    expect(euroGroup?.games).toHaveLength(1);
    expect(euroGroup?.games[0]).toMatchObject({ status: "live", period: 3, clock: "07:42" });

    expect(result.delayed).toBe(false);
  });

  it("returns an empty list for a date with no games", async () => {
    await seedLeagueAndTeams();

    const result = await getGamesForDate("2026-01-01");

    expect(result.leagues).toEqual([]);
  });

  it("marks the response delayed when a live game hasn't updated in over 60s", async () => {
    const { nba, nbaSeason, lakers, celtics } = await seedLeagueAndTeams();
    const staleDate = new Date(Date.now() - 90 * 1000);

    await db.insert(game).values({
      provider: "api-sports",
      providerRef: "g1",
      seasonId: nbaSeason.id,
      leagueId: nba.id,
      homeTeamId: lakers.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-07-07T02:00:00Z"),
      status: "live",
      period: 2,
      clock: "05:00",
      homeScore: 40,
      awayScore: 38,
      venue: null,
      updatedAt: staleDate,
    });

    const result = await getGamesForDate("2026-07-07");

    expect(result.delayed).toBe(true);
  });

  it("is not delayed when a finished game's updatedAt is old", async () => {
    const { nba, nbaSeason, lakers, celtics } = await seedLeagueAndTeams();
    const staleDate = new Date(Date.now() - 90 * 1000);

    await db.insert(game).values({
      provider: "api-sports",
      providerRef: "g1",
      seasonId: nbaSeason.id,
      leagueId: nba.id,
      homeTeamId: lakers.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-07-07T02:00:00Z"),
      status: "final",
      period: null,
      clock: null,
      homeScore: 90,
      awayScore: 80,
      venue: null,
      updatedAt: staleDate,
    });

    const result = await getGamesForDate("2026-07-07");

    expect(result.delayed).toBe(false);
  });
});
