import { redis } from "@hooply/db";
import { fetchGamesByDate } from "../providers/api-sports/client";
import { drizzleGameStore, resolveCuratedLeagueSeasons, syncGame } from "./sync-game";

export async function ingestGames(apiKey: string, date: string): Promise<void> {
  const { leagueIdByProviderRef, currentSeasonIdByLeagueId } =
    await resolveCuratedLeagueSeasons(drizzleGameStore);
  if (leagueIdByProviderRef.size === 0) return;

  const rawGames = await fetchGamesByDate(date, apiKey);

  for (const raw of rawGames) {
    const leagueId = leagueIdByProviderRef.get(String(raw.league.id));
    if (!leagueId) continue; // not one of our curated leagues

    const seasonId = currentSeasonIdByLeagueId.get(leagueId);
    if (!seasonId) continue; // league ingested but current season not seeded yet

    await syncGame(raw, leagueId, seasonId, drizzleGameStore, redis);
  }
}
