import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import { getBoxScore } from "../../src/queries/games";
import {
  game,
  league,
  player,
  playerGameStat,
  season,
  team,
  teamGameStat,
} from "../../src/schema/index";

async function resetTables() {
  await db.delete(playerGameStat);
  await db.delete(teamGameStat);
  await db.delete(game);
  await db.delete(player);
  await db.delete(team);
  await db.delete(season);
  await db.delete(league);
}

async function seedGame(
  overrides: { status?: "live" | "final"; statsSyncedAt?: Date | null } = {},
) {
  const [nba] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "bs-12",
      name: "NBA",
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
    })
    .returning();
  if (!nba) throw new Error("expected league to be inserted");

  const [nbaSeason] = await db
    .insert(season)
    .values({ leagueId: nba.id, providerRef: "2025-2026", label: "2025-2026", isCurrent: true })
    .returning();
  if (!nbaSeason) throw new Error("expected season to be inserted");

  const teamRows = await db
    .insert(team)
    .values([
      { provider: "api-sports", providerRef: "bs-1", name: "Lakers", code: "LAL", logoUrl: null },
      { provider: "api-sports", providerRef: "bs-2", name: "Celtics", code: "BOS", logoUrl: null },
    ])
    .returning();
  const [lakers, celtics] = teamRows;
  if (!lakers || !celtics) throw new Error("expected 2 teams to be inserted");

  const [gameRow] = await db
    .insert(game)
    .values({
      provider: "api-sports",
      providerRef: "bs-g1",
      seasonId: nbaSeason.id,
      leagueId: nba.id,
      homeTeamId: lakers.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-07-07T02:00:00Z"),
      status: overrides.status ?? "final",
      homeScore: 101,
      awayScore: 98,
      statsSyncedAt: overrides.statsSyncedAt === undefined ? new Date() : overrides.statsSyncedAt,
      updatedAt: new Date(),
    })
    .returning();
  if (!gameRow) throw new Error("expected game to be inserted");

  const playerRows = await db
    .insert(player)
    .values([
      { provider: "api-sports", providerRef: "bs-p1", teamId: lakers.id, fullName: "Starter One" },
      { provider: "api-sports", providerRef: "bs-p2", teamId: lakers.id, fullName: "Bench One" },
      { provider: "api-sports", providerRef: "bs-p3", teamId: celtics.id, fullName: "Starter Two" },
    ])
    .returning();
  const [starterOne, benchOne, starterTwo] = playerRows;
  if (!starterOne || !benchOne || !starterTwo) throw new Error("expected 3 players to be inserted");

  return { nba, nbaSeason, lakers, celtics, gameRow, starterOne, benchOne, starterTwo };
}

describe("getBoxScore", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns null when the game hasn't had stats synced yet", async () => {
    const { gameRow } = await seedGame({ statsSyncedAt: null });

    const result = await getBoxScore(gameRow.id);

    expect(result).toBeNull();
  });

  it("returns null for a game id that doesn't exist", async () => {
    const result = await getBoxScore("11111111-1111-1111-1111-111111111111");
    expect(result).toBeNull();
  });

  it("returns null for a malformed (non-uuid) id instead of throwing", async () => {
    const result = await getBoxScore("not-a-uuid");
    expect(result).toBeNull();
  });

  it("groups team_stats and player_stats by home/away, starters first then by points", async () => {
    const { lakers, celtics, gameRow, starterOne, benchOne, starterTwo } = await seedGame();

    await db.insert(teamGameStat).values([
      {
        gameId: gameRow.id,
        teamId: lakers.id,
        points: 101,
        reboundsOff: 10,
        reboundsDef: 30,
        assists: 22,
        steals: 8,
        blocks: 5,
        turnovers: 12,
        fouls: 18,
        fgMade: 40,
        fgAtt: 85,
        threeMade: 12,
        threeAtt: 32,
        ftMade: 9,
        ftAtt: 11,
      },
      {
        gameId: gameRow.id,
        teamId: celtics.id,
        points: 98,
        reboundsOff: 8,
        reboundsDef: 28,
        assists: 20,
        steals: 6,
        blocks: 3,
        turnovers: 14,
        fouls: 20,
        fgMade: 38,
        fgAtt: 90,
        threeMade: 10,
        threeAtt: 30,
        ftMade: 12,
        ftAtt: 15,
      },
    ]);

    await db.insert(playerGameStat).values([
      {
        gameId: gameRow.id,
        playerId: benchOne.id,
        teamId: lakers.id,
        secondsPlayed: 600,
        points: 8,
        assists: 1,
        reboundsOff: 1,
        reboundsDef: 2,
        steals: 1,
        blocks: 0,
        turnovers: 1,
        fouls: 2,
        fgMade: 3,
        fgAtt: 7,
        threeMade: 1,
        threeAtt: 3,
        ftMade: 1,
        ftAtt: 1,
        plusMinus: -4,
        isStarter: false,
      },
      {
        gameId: gameRow.id,
        playerId: starterOne.id,
        teamId: lakers.id,
        secondsPlayed: 2112,
        points: 28,
        assists: 6,
        reboundsOff: 1,
        reboundsDef: 4,
        steals: 2,
        blocks: 0,
        turnovers: 3,
        fouls: 2,
        fgMade: 10,
        fgAtt: 19,
        threeMade: 4,
        threeAtt: 9,
        ftMade: 4,
        ftAtt: 4,
        plusMinus: 12,
        isStarter: true,
      },
      {
        gameId: gameRow.id,
        playerId: starterTwo.id,
        teamId: celtics.id,
        secondsPlayed: 2000,
        points: 24,
        assists: 5,
        reboundsOff: 2,
        reboundsDef: 6,
        steals: 1,
        blocks: 1,
        turnovers: 2,
        fouls: 3,
        fgMade: 9,
        fgAtt: 18,
        threeMade: 3,
        threeAtt: 8,
        ftMade: 3,
        ftAtt: 4,
        plusMinus: null,
        isStarter: true,
      },
    ]);

    const result = await getBoxScore(gameRow.id);

    expect(result?.isFinal).toBe(true);
    expect(result?.delayed).toBe(false);

    expect(result?.boxScore.team_stats.home).toEqual({
      team: { id: lakers.id, name: "Lakers", code: "LAL", logo_url: null },
      stats: {
        points: 101,
        rebounds_off: 10,
        rebounds_def: 30,
        rebounds_total: 40,
        assists: 22,
        steals: 8,
        blocks: 5,
        turnovers: 12,
        fouls: 18,
        fg_made: 40,
        fg_att: 85,
        three_made: 12,
        three_att: 32,
        ft_made: 9,
        ft_att: 11,
      },
    });

    // Starters first, then bench — home team has one of each.
    expect(result?.boxScore.player_stats.home.map((p) => p.player.name)).toEqual([
      "Starter One",
      "Bench One",
    ]);
    expect(result?.boxScore.player_stats.home[0]).toMatchObject({
      is_starter: true,
      seconds_played: 2112,
      plus_minus: 12,
      stats: { points: 28, rebounds_total: 5 },
    });

    expect(result?.boxScore.player_stats.away.map((p) => p.player.name)).toEqual(["Starter Two"]);
    expect(result?.boxScore.player_stats.away[0]).toMatchObject({
      plus_minus: null,
    });
  });

  it("marks a live game's box score delayed once stats_synced_at is stale", async () => {
    const { lakers, celtics, gameRow } = await seedGame({
      status: "live",
      statsSyncedAt: new Date(Date.now() - 3 * 60 * 1000),
    });

    await db.insert(teamGameStat).values([
      {
        gameId: gameRow.id,
        teamId: lakers.id,
        points: 50,
        reboundsOff: 5,
        reboundsDef: 15,
        assists: 10,
        steals: 4,
        blocks: 2,
        turnovers: 6,
        fouls: 9,
        fgMade: 20,
        fgAtt: 42,
        threeMade: 6,
        threeAtt: 16,
        ftMade: 4,
        ftAtt: 5,
      },
      {
        gameId: gameRow.id,
        teamId: celtics.id,
        points: 48,
        reboundsOff: 4,
        reboundsDef: 14,
        assists: 9,
        steals: 3,
        blocks: 1,
        turnovers: 7,
        fouls: 10,
        fgMade: 19,
        fgAtt: 44,
        threeMade: 5,
        threeAtt: 15,
        ftMade: 5,
        ftAtt: 6,
      },
    ]);

    const result = await getBoxScore(gameRow.id);

    expect(result?.delayed).toBe(true);
    expect(result?.isFinal).toBe(false);
  });

  it("returns null if only one team's stats have synced yet (mid-sync)", async () => {
    const { lakers, gameRow } = await seedGame();

    await db.insert(teamGameStat).values({
      gameId: gameRow.id,
      teamId: lakers.id,
      points: 101,
      reboundsOff: 10,
      reboundsDef: 30,
      assists: 22,
      steals: 8,
      blocks: 5,
      turnovers: 12,
      fouls: 18,
      fgMade: 40,
      fgAtt: 85,
      threeMade: 12,
      threeAtt: 32,
      ftMade: 9,
      ftAtt: 11,
    });

    const result = await getBoxScore(gameRow.id);

    expect(result).toBeNull();
  });
});
