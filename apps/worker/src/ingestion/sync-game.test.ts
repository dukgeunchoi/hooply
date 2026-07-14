import { describe, expect, it } from "vitest";
import { changeEvents } from "../events";
import type { NormalizedGameStatus, NormalizedTeamStub } from "../normalize/game";
import type { ApiSportsGame } from "../providers/api-sports/types";
import { CURATED_LEAGUES } from "./curated-leagues";
import type {
  CuratedLeagueSeasons,
  GameInsertValues,
  GameStore,
  GameSyncResult,
  LiveRedisClient,
} from "./sync-game";
import {
  buildLiveSnapshot,
  isLiveStatus,
  liveGameKey,
  liveLeagueKey,
  resolveCuratedLeagueSeasons,
  syncGame,
} from "./sync-game";

function makeRaw(overrides: Partial<ApiSportsGame> = {}): ApiSportsGame {
  return {
    id: 502074,
    date: "2026-07-11T00:30:00+00:00",
    venue: "Thomas & Mack Center",
    status: { long: "Not Started", short: "NS", timer: null },
    league: { id: 12 },
    teams: {
      home: { id: 146, name: "Memphis Grizzlies", logo: "https://media/146.png" },
      away: { id: 136, name: "Chicago Bulls", logo: "https://media/136.png" },
    },
    scores: {
      home: {
        quarter_1: null,
        quarter_2: null,
        quarter_3: null,
        quarter_4: null,
        over_time: null,
        total: null,
      },
      away: {
        quarter_1: null,
        quarter_2: null,
        quarter_3: null,
        quarter_4: null,
        over_time: null,
        total: null,
      },
    },
    ...overrides,
  };
}

function emptyCuratedLeagueSeasons(): CuratedLeagueSeasons {
  return {
    leagueIdByProviderRef: new Map(),
    currentSeasonIdByLeagueId: new Map(),
    leagueProviderRefById: new Map(),
    currentSeasonProviderRefByLeagueId: new Map(),
  };
}

// In-memory fake satisfying GameStore, so orchestration (syncGame,
// resolveCuratedLeagueSeasons) is testable without a real Postgres — the
// same discipline FakeRedis already applies to LiveRedisClient.
class FakeGameStore implements GameStore {
  private teams = new Map<string, string>();
  private games = new Map<string, { id: string; status: NormalizedGameStatus }>();
  private nextId = 1;
  findLeagueSeasonsCalls: string[][] = [];

  constructor(private leagueSeasons: CuratedLeagueSeasons = emptyCuratedLeagueSeasons()) {}

  async findLeagueSeasons(providerRefs: string[]): Promise<CuratedLeagueSeasons> {
    this.findLeagueSeasonsCalls.push(providerRefs);
    return this.leagueSeasons;
  }

  async findGameStatus(
    provider: string,
    providerRef: string,
  ): Promise<NormalizedGameStatus | null> {
    return this.games.get(`${provider}:${providerRef}`)?.status ?? null;
  }

  async upsertGame(values: GameInsertValues): Promise<string> {
    const key = `${values.provider}:${values.providerRef}`;
    const id = this.games.get(key)?.id ?? `game-${this.nextId++}`;
    this.games.set(key, { id, status: values.status as NormalizedGameStatus });
    return id;
  }

  async upsertTeamStub(stub: NormalizedTeamStub): Promise<string> {
    const key = `${stub.provider}:${stub.providerRef}`;
    let id = this.teams.get(key);
    if (!id) {
      id = `team-${this.teams.size + 1}`;
      this.teams.set(key, id);
    }
    return id;
  }
}

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

const LEAGUE_ID = "22222222-2222-2222-2222-222222222222";
const SEASON_ID = "55555555-5555-5555-5555-555555555555";

describe("syncGame", () => {
  it("upserts teams and the game via the injected store", async () => {
    const store = new FakeGameStore();
    const redis = new FakeRedis();

    const result = await syncGame(
      makeRaw(),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T00:00:00Z"),
    );

    expect(result.leagueId).toBe(LEAGUE_ID);
    expect(result.homeTeamId).toBe("team-1");
    expect(result.awayTeamId).toBe("team-2");
    expect(result.previousStatus).toBeNull();
    expect(result.normalized.status).toBe("scheduled");
  });

  it("emits game_started on the shared changeEvents bus the first time a game goes live", async () => {
    const store = new FakeGameStore();
    const redis = new FakeRedis();
    const received: unknown[] = [];
    changeEvents.once("game_started", (event) => received.push(event));

    await syncGame(
      makeRaw({ status: { long: "1st Quarter", short: "Q1", timer: "5" } }),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T00:35:00Z"),
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "game_started", status: "live" });
  });

  it("emits nothing on a second sync when status hasn't changed", async () => {
    const store = new FakeGameStore();
    const redis = new FakeRedis();
    const liveRaw = makeRaw({ status: { long: "1st Quarter", short: "Q1", timer: "5" } });

    await syncGame(liveRaw, LEAGUE_ID, SEASON_ID, store, redis, new Date("2026-07-11T00:35:00Z"));

    const received: unknown[] = [];
    changeEvents.once("game_started", (event) => received.push(event));
    await syncGame(liveRaw, LEAGUE_ID, SEASON_ID, store, redis, new Date("2026-07-11T00:36:00Z"));

    expect(received).toEqual([]);
  });

  it("does not re-fire game_started when a suspended game resumes", async () => {
    const store = new FakeGameStore();
    const redis = new FakeRedis();

    await syncGame(
      makeRaw({ status: { long: "1st Quarter", short: "Q1", timer: "5" } }),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T00:35:00Z"),
    );
    await syncGame(
      makeRaw({ status: { long: "Suspended", short: "SUSP", timer: null } }),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T00:40:00Z"),
    );

    const received: unknown[] = [];
    changeEvents.once("game_started", (event) => received.push(event));
    await syncGame(
      makeRaw({ status: { long: "2nd Quarter", short: "Q2", timer: "10" } }),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T00:50:00Z"),
    );

    expect(received).toEqual([]);
  });

  it("keeps the live cadences in sync structurally: every syncGame call syncs the Redis live feed", async () => {
    const store = new FakeGameStore();
    const redis = new FakeRedis();

    const result = await syncGame(
      makeRaw({ status: { long: "1st Quarter", short: "Q1", timer: "5" } }),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T00:35:00Z"),
    );

    expect(redis.values.has(liveGameKey(result.gameId))).toBe(true);
    expect(redis.sets.get(liveLeagueKey(LEAGUE_ID))?.has(result.gameId)).toBe(true);

    await syncGame(
      makeRaw({ status: { long: "Finished", short: "FT", timer: null } }),
      LEAGUE_ID,
      SEASON_ID,
      store,
      redis,
      new Date("2026-07-11T02:20:00Z"),
    );

    expect(redis.values.has(liveGameKey(result.gameId))).toBe(false);
    expect(redis.sets.get(liveLeagueKey(LEAGUE_ID))?.has(result.gameId)).toBe(false);
  });
});

describe("resolveCuratedLeagueSeasons", () => {
  it("asks the store for exactly the curated league provider refs", async () => {
    const leagueSeasons = emptyCuratedLeagueSeasons();
    const store = new FakeGameStore(leagueSeasons);

    const result = await resolveCuratedLeagueSeasons(store);

    expect(store.findLeagueSeasonsCalls).toEqual([CURATED_LEAGUES.map((c) => c.providerRef)]);
    expect(result).toBe(leagueSeasons);
  });
});

describe("isLiveStatus", () => {
  it("is true only for status 'live'", () => {
    expect(isLiveStatus("live")).toBe(true);
    for (const status of ["scheduled", "final", "suspended", "postponed", "cancelled"] as const) {
      expect(isLiveStatus(status)).toBe(false);
    }
  });
});

describe("buildLiveSnapshot", () => {
  it("carries score/period/clock and stamps the poll time", () => {
    const result: GameSyncResult = {
      gameId: "11111111-1111-1111-1111-111111111111",
      leagueId: LEAGUE_ID,
      homeTeamId: "team-1",
      awayTeamId: "team-2",
      previousStatus: "scheduled",
      normalized: {
        provider: "api-sports",
        providerRef: "502074",
        homeTeamProviderRef: "146",
        awayTeamProviderRef: "136",
        tipoffAt: "2026-07-11T00:30:00+00:00",
        status: "live",
        period: 3,
        clock: "07:42",
        homeScore: 40,
        awayScore: 38,
        periodScores: null,
        venue: null,
      },
    };
    const now = new Date("2026-07-11T01:00:00Z");

    expect(buildLiveSnapshot(result, now)).toEqual({
      id: result.gameId,
      status: "live",
      period: 3,
      clock: "07:42",
      homeScore: 40,
      awayScore: 38,
      updatedAt: "2026-07-11T01:00:00.000Z",
    });
  });
});
