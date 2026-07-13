import { db, game, redis } from "@hooply/db";
import type { LiveGameSnapshot } from "@hooply/shared";
import { and, inArray, lte } from "drizzle-orm";
import type { NormalizedGameStatus } from "../normalize/game";
import { fetchGamesByDate } from "../providers/api-sports/client";
import type { ApiSportsGame } from "../providers/api-sports/types";
import type { GameSyncResult } from "./games";
import { emitChangeEventIfAny, resolveCuratedLeagueSeasons, upsertGame } from "./games";

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

export async function syncLiveRedisState(
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

// Gate for the 15s cron tick (see docs/provider-decision.md's request
// budget: ~4 req/min only "during live windows", not all day). A game is in
// its live window from the moment its tip-off passes until it reaches a
// terminal state — deliberately including `scheduled` games whose
// tipoff_at has already passed, so the fast poll picks up the
// scheduled -> live transition (and fires `game_started`) within 15s of
// tip-off rather than waiting for the slower 5-minute sync.
export async function hasGamesInLiveWindow(now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: game.id })
    .from(game)
    .where(and(lte(game.tipoffAt, now), inArray(game.status, ["scheduled", "live", "suspended"])))
    .limit(1);
  return row !== undefined;
}

// The provider buckets a game under the UTC date it tipped off on. A game
// that tipped off shortly before UTC midnight and is still live after the
// rollover would silently fall out of a "today only" fetch — this covers
// that gap the same way datesToIngest() in index.ts covers the forward
// direction for the slow sync.
export function liveIngestDates(now: Date): string[] {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [yesterday, today];
}

export async function ingestLiveGames(apiKey: string, now: Date = new Date()): Promise<void> {
  if (!(await hasGamesInLiveWindow(now))) return;

  const { leagueIdByProviderRef, currentSeasonIdByLeagueId } = await resolveCuratedLeagueSeasons();
  if (leagueIdByProviderRef.size === 0) return;

  const rawGamesByProviderId = new Map<number, ApiSportsGame>();
  for (const date of liveIngestDates(now)) {
    for (const raw of await fetchGamesByDate(date, apiKey)) {
      rawGamesByProviderId.set(raw.id, raw);
    }
  }

  for (const raw of rawGamesByProviderId.values()) {
    const leagueId = leagueIdByProviderRef.get(String(raw.league.id));
    if (!leagueId) continue; // not one of our curated leagues

    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    if (!seasonId) continue; // league ingested but current season not seeded yet

    const result = await upsertGame(raw, leagueId, seasonId);
    emitChangeEventIfAny(result);
    await syncLiveRedisState(redis, result, now);
  }
}
