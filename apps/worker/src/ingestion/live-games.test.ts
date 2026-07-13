import { describe, expect, it } from "vitest";
import type { NormalizedGame } from "../normalize/game";
import type { GameSyncResult } from "./games";
import {
  type LiveRedisClient,
  buildLiveSnapshot,
  isLiveStatus,
  liveGameKey,
  liveIngestDates,
  liveLeagueKey,
  syncLiveRedisState,
} from "./live-games";

class FakeRedis implements LiveRedisClient {
  values = new Map<string, string>();
  sets = new Map<string, Set<string>>();

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async sadd(key: string, member: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set();
    set.add(member);
    this.sets.set(key, set);
  }

  async srem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member);
  }

  async expire(): Promise<void> {}
}

function makeNormalized(overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    provider: "api-sports",
    providerRef: "502074",
    homeTeamProviderRef: "146",
    awayTeamProviderRef: "136",
    tipoffAt: "2026-07-11T00:30:00+00:00",
    status: "live",
    period: 2,
    clock: "05:30",
    homeScore: 40,
    awayScore: 38,
    periodScores: { home: [20, 20], away: [19, 19] },
    venue: "Thomas & Mack Center",
    ...overrides,
  };
}

const GAME_ID = "11111111-1111-1111-1111-111111111111";
const LEAGUE_ID = "22222222-2222-2222-2222-222222222222";

function makeResult(overrides: Partial<NormalizedGame> = {}): GameSyncResult {
  return {
    gameId: GAME_ID,
    leagueId: LEAGUE_ID,
    homeTeamId: "33333333-3333-3333-3333-333333333333",
    awayTeamId: "44444444-4444-4444-4444-444444444444",
    previousStatus: null,
    normalized: makeNormalized(overrides),
  };
}

describe("isLiveStatus", () => {
  it("is true only for status 'live'", () => {
    expect(isLiveStatus("live")).toBe(true);
    for (const status of ["scheduled", "final", "suspended", "postponed", "cancelled"] as const) {
      expect(isLiveStatus(status)).toBe(false);
    }
  });
});

describe("liveIngestDates", () => {
  it("includes yesterday so a game that tipped off before UTC midnight isn't dropped after rollover", () => {
    expect(liveIngestDates(new Date("2026-07-13T00:05:00Z"))).toEqual(["2026-07-12", "2026-07-13"]);
  });

  it("still covers just [yesterday, today] well after midnight", () => {
    expect(liveIngestDates(new Date("2026-07-13T18:30:00Z"))).toEqual(["2026-07-12", "2026-07-13"]);
  });
});

describe("buildLiveSnapshot", () => {
  it("carries score/period/clock and stamps the poll time", () => {
    const now = new Date("2026-07-11T01:00:00Z");
    const snapshot = buildLiveSnapshot(makeResult({ period: 3, clock: "07:42" }), now);
    expect(snapshot).toEqual({
      id: GAME_ID,
      status: "live",
      period: 3,
      clock: "07:42",
      homeScore: 40,
      awayScore: 38,
      updatedAt: "2026-07-11T01:00:00.000Z",
    });
  });
});

describe("syncLiveRedisState — live -> suspended -> live", () => {
  it("adds the game on live, removes it on suspended (keeping the score in the last write), then re-adds it on resume", async () => {
    const redis = new FakeRedis();
    const gameKey = liveGameKey(GAME_ID);
    const leagueKey = liveLeagueKey(LEAGUE_ID);

    await syncLiveRedisState(redis, makeResult({ homeScore: 40, awayScore: 38 }), new Date());
    expect(redis.values.has(gameKey)).toBe(true);
    expect(redis.sets.get(leagueKey)?.has(GAME_ID)).toBe(true);
    expect(JSON.parse(redis.values.get(gameKey) ?? "{}")).toMatchObject({
      homeScore: 40,
      awayScore: 38,
    });

    // Mid-game suspension: partial score carries into the upsert result
    // (Postgres retains it regardless), but the live feed drops the game.
    await syncLiveRedisState(
      redis,
      makeResult({ status: "suspended", homeScore: 63, awayScore: 60 }),
      new Date(),
    );
    expect(redis.values.has(gameKey)).toBe(false);
    expect(redis.sets.get(leagueKey)?.has(GAME_ID)).toBe(false);

    await syncLiveRedisState(
      redis,
      makeResult({ status: "live", homeScore: 65, awayScore: 60 }),
      new Date(),
    );
    expect(redis.values.has(gameKey)).toBe(true);
    expect(redis.sets.get(leagueKey)?.has(GAME_ID)).toBe(true);
    expect(JSON.parse(redis.values.get(gameKey) ?? "{}")).toMatchObject({
      status: "live",
      homeScore: 65,
      awayScore: 60,
    });
  });

  it("removes a final game from the live feed", async () => {
    const redis = new FakeRedis();
    await syncLiveRedisState(redis, makeResult({ status: "live" }), new Date());
    await syncLiveRedisState(redis, makeResult({ status: "final" }), new Date());

    expect(redis.values.has(liveGameKey(GAME_ID))).toBe(false);
    expect(redis.sets.get(liveLeagueKey(LEAGUE_ID))?.has(GAME_ID)).toBe(false);
  });
});
