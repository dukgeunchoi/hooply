import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/client";
import { getPlayerById, getPlayerGameLog } from "../../src/queries/players";
import { game, league, player, playerGameStat, season, team } from "../../src/schema/index";

async function resetTables() {
  await db.delete(playerGameStat);
  await db.delete(game);
  await db.delete(player);
  await db.delete(team);
  await db.delete(season);
  await db.delete(league);
}

async function seedLeagueSeasonTeams() {
  const [nba] = await db
    .insert(league)
    .values({
      provider: "api-sports",
      providerRef: "pl-12",
      name: "NBA",
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
    })
    .returning();
  if (!nba) throw new Error("expected league to be inserted");

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
      { provider: "api-sports", providerRef: "pl-1", name: "Thunder", code: "OKC", logoUrl: null },
      { provider: "api-sports", providerRef: "pl-2", name: "Celtics", code: "BOS", logoUrl: null },
    ])
    .returning();
  const [thunder, celtics] = teamRows;
  if (!thunder || !celtics) throw new Error("expected 2 teams to be inserted");

  return { nba, currentSeason, pastSeason, thunder, celtics };
}

async function seedGame(overrides: {
  providerRef: string;
  seasonId: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  tipoffAt: Date;
  status?: "scheduled" | "live" | "final";
  homeScore?: number;
  awayScore?: number;
}) {
  const [row] = await db
    .insert(game)
    .values({
      provider: "api-sports",
      providerRef: overrides.providerRef,
      seasonId: overrides.seasonId,
      leagueId: overrides.leagueId,
      homeTeamId: overrides.homeTeamId,
      awayTeamId: overrides.awayTeamId,
      tipoffAt: overrides.tipoffAt,
      status: overrides.status ?? "final",
      homeScore: overrides.homeScore ?? 0,
      awayScore: overrides.awayScore ?? 0,
      updatedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error("expected game to be inserted");
  return row;
}

describe("getPlayerById", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns null for a malformed (non-uuid) id", async () => {
    expect(await getPlayerById("not-a-uuid")).toBeNull();
  });

  it("returns null for a player that doesn't exist", async () => {
    expect(await getPlayerById("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("renders team null (Free Agent) when player.team_id is null", async () => {
    const [freeAgent] = await db
      .insert(player)
      .values({ provider: "api-sports", providerRef: "pl-fa", fullName: "Free Agent Guy" })
      .returning();
    if (!freeAgent) throw new Error("expected player to be inserted");

    const result = await getPlayerById(freeAgent.id);

    expect(result?.team).toBeNull();
    expect(result?.season_averages).toBeNull();
  });

  it("treats a retired alias (canonical_id set) as not found", async () => {
    const [canonical] = await db
      .insert(player)
      .values({ provider: "api-sports", providerRef: "pl-canon", fullName: "Real Player" })
      .returning();
    const [alias] = await db
      .insert(player)
      .values({ provider: "api-sports", providerRef: "pl-alias", fullName: "Old Alias" })
      .returning();
    if (!canonical || !alias) throw new Error("expected players to be inserted");
    await db.update(player).set({ canonicalId: canonical.id }).where(eq(player.id, alias.id));

    expect(await getPlayerById(alias.id)).toBeNull();
  });

  it("computes season averages across current-season games only, and percentages null with zero attempts", async () => {
    const { nba, currentSeason, pastSeason, thunder, celtics } = await seedLeagueSeasonTeams();
    const [starter] = await db
      .insert(player)
      .values({
        provider: "api-sports",
        providerRef: "pl-starter",
        teamId: thunder.id,
        fullName: "Star Player",
        position: "Guard",
        jerseyNumber: 7,
        heightCm: 198,
        weightKg: 95,
        country: "USA",
        photoUrl: "https://media/star.png",
      })
      .returning();
    if (!starter) throw new Error("expected player to be inserted");

    const currentGame1 = await seedGame({
      providerRef: "pl-g1",
      seasonId: currentSeason.id,
      leagueId: nba.id,
      homeTeamId: thunder.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-01-10T00:00:00Z"),
    });
    const currentGame2 = await seedGame({
      providerRef: "pl-g2",
      seasonId: currentSeason.id,
      leagueId: nba.id,
      homeTeamId: celtics.id,
      awayTeamId: thunder.id,
      tipoffAt: new Date("2026-01-12T00:00:00Z"),
    });
    const pastSeasonGame = await seedGame({
      providerRef: "pl-g-old",
      seasonId: pastSeason.id,
      leagueId: nba.id,
      homeTeamId: thunder.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2025-01-10T00:00:00Z"),
    });

    await db.insert(playerGameStat).values([
      {
        gameId: currentGame1.id,
        playerId: starter.id,
        teamId: thunder.id,
        secondsPlayed: 1800, // 30 min
        points: 20,
        assists: 4,
        reboundsOff: 2,
        reboundsDef: 6,
        fgMade: 8,
        fgAtt: 16,
        threeMade: 0,
        threeAtt: 0, // no 3PT attempts this game
        ftMade: 4,
        ftAtt: 4,
        isStarter: true,
      },
      {
        gameId: currentGame2.id,
        playerId: starter.id,
        teamId: thunder.id,
        secondsPlayed: 2100, // 35 min
        points: 30,
        assists: 6,
        reboundsOff: 1,
        reboundsDef: 5,
        fgMade: 10,
        fgAtt: 18,
        threeMade: 4,
        threeAtt: 8,
        ftMade: 6,
        ftAtt: 6,
        isStarter: true,
      },
      // Past-season game — must be excluded from the average.
      {
        gameId: pastSeasonGame.id,
        playerId: starter.id,
        teamId: thunder.id,
        secondsPlayed: 3600,
        points: 999,
        assists: 99,
        reboundsOff: 9,
        reboundsDef: 9,
        fgMade: 1,
        fgAtt: 1,
        threeMade: 1,
        threeAtt: 1,
        ftMade: 1,
        ftAtt: 1,
        isStarter: true,
      },
    ]);

    const result = await getPlayerById(starter.id);

    expect(result?.team).toEqual({ id: thunder.id, name: "Thunder", code: "OKC", logo_url: null });
    expect(result?.season_averages).toEqual({
      games_played: 2,
      ppg: 25, // (20+30)/2
      rpg: 7, // (8+6)/2
      apg: 5, // (4+6)/2
      mpg: 32.5, // (1800+2100)/2/60
      fg_pct: (8 + 10) / (16 + 18),
      three_pct: (0 + 4) / (0 + 8),
      ft_pct: (4 + 6) / (4 + 6),
    });
  });
});

describe("getPlayerGameLog", () => {
  beforeEach(resetTables);
  afterAll(resetTables);

  it("returns null for a player that doesn't exist", async () => {
    expect(await getPlayerGameLog("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("orders newest-first and computes opponent/result/stats for both home and away games", async () => {
    const { nba, currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();
    const [starter] = await db
      .insert(player)
      .values({
        provider: "api-sports",
        providerRef: "pl-log-1",
        teamId: thunder.id,
        fullName: "Log Guy",
      })
      .returning();
    if (!starter) throw new Error("expected player to be inserted");

    const homeWin = await seedGame({
      providerRef: "pl-log-g1",
      seasonId: currentSeason.id,
      leagueId: nba.id,
      homeTeamId: thunder.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-01-10T00:00:00Z"),
      status: "final",
      homeScore: 110,
      awayScore: 100,
    });
    const awayLoss = await seedGame({
      providerRef: "pl-log-g2",
      seasonId: currentSeason.id,
      leagueId: nba.id,
      homeTeamId: celtics.id,
      awayTeamId: thunder.id,
      tipoffAt: new Date("2026-01-15T00:00:00Z"),
      status: "final",
      homeScore: 105,
      awayScore: 95,
    });
    const upcoming = await seedGame({
      providerRef: "pl-log-g3",
      seasonId: currentSeason.id,
      leagueId: nba.id,
      homeTeamId: thunder.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-01-20T00:00:00Z"),
      status: "scheduled",
    });

    await db.insert(playerGameStat).values([
      {
        gameId: homeWin.id,
        playerId: starter.id,
        teamId: thunder.id,
        secondsPlayed: 1800,
        points: 20,
        assists: 3,
        reboundsOff: 2,
        reboundsDef: 4,
      },
      {
        gameId: awayLoss.id,
        playerId: starter.id,
        teamId: thunder.id,
        secondsPlayed: 1700,
        points: 15,
        assists: 5,
        reboundsOff: 1,
        reboundsDef: 3,
      },
      {
        gameId: upcoming.id,
        playerId: starter.id,
        teamId: thunder.id,
        secondsPlayed: 0,
        points: 0,
        assists: 0,
        reboundsOff: 0,
        reboundsDef: 0,
      },
    ]);

    const result = await getPlayerGameLog(starter.id);

    expect(result?.nextCursor).toBeNull();
    expect(result?.rows.map((r) => r.game.id)).toEqual([upcoming.id, awayLoss.id, homeWin.id]);

    const [upcomingRow, lossRow, winRow] = result?.rows ?? [];
    expect(upcomingRow?.result).toBeNull();
    expect(lossRow?.result).toBe("L");
    expect(lossRow?.opponent).toEqual({
      id: celtics.id,
      name: "Celtics",
      code: "BOS",
      logo_url: null,
    });
    expect(lossRow?.stats).toEqual({
      seconds_played: 1700,
      points: 15,
      rebounds_total: 4,
      assists: 5,
    });
    expect(winRow?.result).toBe("W");
    expect(winRow?.opponent).toEqual({
      id: celtics.id,
      name: "Celtics",
      code: "BOS",
      logo_url: null,
    });
  });

  it("defaults to the current season, and an explicit season overrides it", async () => {
    const { nba, currentSeason, pastSeason, thunder, celtics } = await seedLeagueSeasonTeams();
    const [starter] = await db
      .insert(player)
      .values({
        provider: "api-sports",
        providerRef: "pl-log-2",
        teamId: thunder.id,
        fullName: "Season Guy",
      })
      .returning();
    if (!starter) throw new Error("expected player to be inserted");

    const currentGame = await seedGame({
      providerRef: "pl-log-cur",
      seasonId: currentSeason.id,
      leagueId: nba.id,
      homeTeamId: thunder.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2026-01-10T00:00:00Z"),
    });
    const oldGame = await seedGame({
      providerRef: "pl-log-old",
      seasonId: pastSeason.id,
      leagueId: nba.id,
      homeTeamId: thunder.id,
      awayTeamId: celtics.id,
      tipoffAt: new Date("2025-01-10T00:00:00Z"),
    });

    await db.insert(playerGameStat).values([
      { gameId: currentGame.id, playerId: starter.id, teamId: thunder.id },
      { gameId: oldGame.id, playerId: starter.id, teamId: thunder.id },
    ]);

    const defaultResult = await getPlayerGameLog(starter.id);
    expect(defaultResult?.rows.map((r) => r.game.id)).toEqual([currentGame.id]);

    const explicitPast = await getPlayerGameLog(starter.id, { seasonId: pastSeason.id });
    expect(explicitPast?.rows.map((r) => r.game.id)).toEqual([oldGame.id]);
  });

  it("paginates: sets next_cursor once more than a page of rows exists, and the cursor fetches the next page", async () => {
    const { nba, currentSeason, thunder, celtics } = await seedLeagueSeasonTeams();
    const [starter] = await db
      .insert(player)
      .values({
        provider: "api-sports",
        providerRef: "pl-log-3",
        teamId: thunder.id,
        fullName: "Page Guy",
      })
      .returning();
    if (!starter) throw new Error("expected player to be inserted");

    const games = [];
    for (let i = 0; i < 21; i++) {
      const g = await seedGame({
        providerRef: `pl-log-page-${i}`,
        seasonId: currentSeason.id,
        leagueId: nba.id,
        homeTeamId: thunder.id,
        awayTeamId: celtics.id,
        tipoffAt: new Date(Date.UTC(2026, 0, 1 + i)),
      });
      games.push(g);
      await db
        .insert(playerGameStat)
        .values({ gameId: g.id, playerId: starter.id, teamId: thunder.id });
    }

    const firstPage = await getPlayerGameLog(starter.id);
    expect(firstPage?.rows).toHaveLength(20);
    // Newest first: game index 20 (Jan 21) is the newest.
    expect(firstPage?.rows[0]?.game.id).toBe(games[20]?.id);
    expect(firstPage?.nextCursor).not.toBeNull();

    const secondPage = await getPlayerGameLog(starter.id, {
      cursor: firstPage?.nextCursor ?? undefined,
    });
    expect(secondPage?.rows).toHaveLength(1);
    expect(secondPage?.rows[0]?.game.id).toBe(games[0]?.id);
    expect(secondPage?.nextCursor).toBeNull();
  });
});
