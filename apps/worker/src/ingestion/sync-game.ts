import { db, game, league, season } from "@hooply/db";
import type { LiveGameSnapshot } from "@hooply/shared";
import { and, eq, inArray } from "drizzle-orm";
import { detectChangeEvent, emitChangeEvent } from "../events";
import { normalizeGame, normalizeTeamStub } from "../normalize/game";
import type { NormalizedGame, NormalizedGameStatus } from "../normalize/game";
import type { ApiSportsGame } from "../providers/api-sports/types";
import { CURATED_LEAGUES } from "./curated-leagues";
import { upsertTeamStub } from "./teams";

// Everything both ingestion cadences (#14 slow, #16 fast) and standings
// (#15) need to resolve a raw provider payload down to our internal ids —
// computed once per batch, not per game/standing row, to avoid N+1 lookups.
export type CuratedLeagueSeasons = {
  leagueIdByProviderRef: Map<string, string>;
  currentSeasonIdByLeagueId: Map<string, string>;
  leagueProviderRefById: Map<string, string>;
  currentSeasonProviderRefByLeagueId: Map<string, string | null>;
};

// The specific Postgres operations ingestion needs, narrowed the same way
// `LiveRedisClient` below narrows ioredis — so orchestration (`syncGame`,
// `resolveCuratedLeagueSeasons`) can be unit-tested against an in-memory
// fake instead of requiring a real database for every test.
export type GameInsertValues = typeof game.$inferInsert;

export type GameStore = {
  findLeagueSeasons(providerRefs: string[]): Promise<CuratedLeagueSeasons>;
  findGameStatus(provider: string, providerRef: string): Promise<NormalizedGameStatus | null>;
  upsertGame(values: GameInsertValues): Promise<string>;
  upsertTeamStub: typeof upsertTeamStub;
};

export const drizzleGameStore: GameStore = {
  async findLeagueSeasons(providerRefs) {
    const leagueRows = await db
      .select({ id: league.id, providerRef: league.providerRef })
      .from(league)
      .where(inArray(league.providerRef, providerRefs));

    const leagueIdByProviderRef = new Map(leagueRows.map((l) => [l.providerRef, l.id]));
    const leagueProviderRefById = new Map(leagueRows.map((l) => [l.id, l.providerRef]));

    const seasonRows =
      leagueRows.length === 0
        ? []
        : await db
            .select({ id: season.id, leagueId: season.leagueId, providerRef: season.providerRef })
            .from(season)
            .where(
              and(
                inArray(
                  season.leagueId,
                  leagueRows.map((l) => l.id),
                ),
                eq(season.isCurrent, true),
              ),
            );

    return {
      leagueIdByProviderRef,
      leagueProviderRefById,
      currentSeasonIdByLeagueId: new Map(seasonRows.map((s) => [s.leagueId, s.id])),
      currentSeasonProviderRefByLeagueId: new Map(
        seasonRows.map((s) => [s.leagueId, s.providerRef]),
      ),
    };
  },

  async findGameStatus(provider, providerRef) {
    const [existing] = await db
      .select({ status: game.status })
      .from(game)
      .where(and(eq(game.provider, provider), eq(game.providerRef, providerRef)));
    return existing?.status ?? null;
  },

  async upsertGame(values) {
    const [row] = await db
      .insert(game)
      .values(values)
      .onConflictDoUpdate({ target: [game.provider, game.providerRef], set: values })
      .returning({ id: game.id });
    if (!row) {
      throw new Error(`Failed to upsert game ${values.providerRef}`);
    }
    return row.id;
  },

  upsertTeamStub,
};

// Shared by both ingestion cadences and standings — all three need "which of
// our leagues/current seasons exist" before they can resolve a raw provider
// payload to our internal ids. Curated-ness (which provider refs count) is
// ingestion policy, not the store's concern, so it lives here rather than on
// `GameStore.findLeagueSeasons`.
export async function resolveCuratedLeagueSeasons(
  store: Pick<GameStore, "findLeagueSeasons">,
): Promise<CuratedLeagueSeasons> {
  const curatedRefs = CURATED_LEAGUES.map((c) => c.providerRef);
  return store.findLeagueSeasons(curatedRefs);
}

export type GameSyncResult = {
  gameId: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  previousStatus: NormalizedGameStatus | null;
  normalized: NormalizedGame;
};

// Self-healing safety net (see docs/data-model.md "Redis keys") — if the
// worker crashes mid-live-game without ever writing the eventual
// suspended/final transition, the stale entry expires instead of haunting
// GET /v1/games/live forever.
const LIVE_TTL_SECONDS = 4 * 60 * 60;

export function liveGameKey(gameId: string): string {
  return `live:game:${gameId}`;
}

export function liveLeagueKey(leagueId: string): string {
  return `live:league:${leagueId}`;
}

// `status = 'live'` is the only lifecycle phase that belongs in the fast
// Redis feed (ADR-0001) — `suspended` keeps its partial scores in Postgres
// but stops appearing here, matching the issue's "stops appearing in the
// live feed but retains its partial scores" requirement.
export function isLiveStatus(status: NormalizedGameStatus): boolean {
  return status === "live";
}

export function buildLiveSnapshot(result: GameSyncResult, now: Date): LiveGameSnapshot {
  return {
    id: result.gameId,
    status: result.normalized.status,
    period: result.normalized.period,
    clock: result.normalized.clock,
    homeScore: result.normalized.homeScore,
    awayScore: result.normalized.awayScore,
    updatedAt: now.toISOString(),
  };
}

// Narrowed to the handful of ioredis methods this module calls, so tests can
// inject an in-memory fake instead of a real Redis connection.
export type LiveRedisClient = {
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  srem(key: string, member: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
};

async function syncLiveRedisState(
  client: LiveRedisClient,
  result: GameSyncResult,
  now: Date,
): Promise<void> {
  const gameKey = liveGameKey(result.gameId);
  const leagueKey = liveLeagueKey(result.leagueId);

  if (isLiveStatus(result.normalized.status)) {
    const snapshot = buildLiveSnapshot(result, now);
    await Promise.all([
      client.set(gameKey, JSON.stringify(snapshot), "EX", LIVE_TTL_SECONDS),
      client.sadd(leagueKey, result.gameId),
      client.expire(leagueKey, LIVE_TTL_SECONDS),
    ]);
  } else {
    await Promise.all([client.del(gameKey), client.srem(leagueKey, result.gameId)]);
  }
}

// The deep interface both ingestion cadences call identically: resolve a raw
// provider game to our ids (done once per batch by the caller — leagueId/
// seasonId are passed in), upsert it, emit a change event on transition, and
// keep the Redis live feed in sync. Folding the Redis step in here (rather
// than leaving it a step callers remember to take) is deliberate — the slow
// cadence used to skip it, so a game that went live via the 5-minute sync
// never appeared in the live feed. One call path removes that drift class
// structurally instead of relying on every future caller to remember it.
export async function syncGame(
  raw: ApiSportsGame,
  leagueId: string,
  seasonId: string,
  store: GameStore,
  redis: LiveRedisClient,
  now: Date = new Date(),
): Promise<GameSyncResult> {
  const normalized = normalizeGame(raw);

  const [homeTeamId, awayTeamId] = await Promise.all([
    store.upsertTeamStub(normalizeTeamStub(raw.teams.home)),
    store.upsertTeamStub(normalizeTeamStub(raw.teams.away)),
  ]);

  const previousStatus = await store.findGameStatus(normalized.provider, normalized.providerRef);

  const gameId = await store.upsertGame({
    provider: normalized.provider,
    providerRef: normalized.providerRef,
    seasonId,
    leagueId,
    homeTeamId,
    awayTeamId,
    tipoffAt: new Date(normalized.tipoffAt),
    status: normalized.status,
    period: normalized.period,
    clock: normalized.clock,
    homeScore: normalized.homeScore,
    awayScore: normalized.awayScore,
    periodScores: normalized.periodScores,
    venue: normalized.venue,
    updatedAt: now,
  });

  const result: GameSyncResult = {
    gameId,
    leagueId,
    homeTeamId,
    awayTeamId,
    previousStatus,
    normalized,
  };

  const changeEvent = detectChangeEvent(previousStatus, normalized.status);
  if (changeEvent) {
    emitChangeEvent({
      type: changeEvent,
      gameId,
      homeTeamId,
      awayTeamId,
      homeScore: normalized.homeScore,
      awayScore: normalized.awayScore,
      status: normalized.status,
    });
  }

  await syncLiveRedisState(redis, result, now);

  return result;
}
