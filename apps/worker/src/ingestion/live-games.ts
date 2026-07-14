import { db, game, redis } from "@hooply/db";
import { and, inArray, lte } from "drizzle-orm";
import { fetchGamesByDate } from "../providers/api-sports/client";
import type { ApiSportsGame } from "../providers/api-sports/types";
import { drizzleGameStore, resolveCuratedLeagueSeasons, syncGame } from "./sync-game";

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

  const { leagueIdByProviderRef, currentSeasonIdByLeagueId } =
    await resolveCuratedLeagueSeasons(drizzleGameStore);
  if (leagueIdByProviderRef.size === 0) return;

  const rawGamesByProviderId = new Map<number, ApiSportsGame>();
  for (const date of liveIngestDates(now)) {
    for (const raw of await fetchGamesByDate(date, apiKey)) {
      rawGamesByProviderId.set(raw.id, raw);
    }
  }

  // Same `syncGame` call the slow cadence uses (see sync-game.ts) — one code
  // path for "what happens when we see a raw game," so the two cadences
  // can't drift on what side effects a transition triggers.
  for (const raw of rawGamesByProviderId.values()) {
    const leagueId = leagueIdByProviderRef.get(String(raw.league.id));
    if (!leagueId) continue; // not one of our curated leagues

    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    if (!seasonId) continue; // league ingested but current season not seeded yet

    await syncGame(raw, leagueId, seasonId, drizzleGameStore, redis, now);
  }
}
