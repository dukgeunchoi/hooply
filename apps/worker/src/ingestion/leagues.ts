import { db, league, season } from "@hooply/db";
import { and, eq, notInArray } from "drizzle-orm";
import { normalizeLeague, normalizeSeason, pickSeasonsToSeed } from "../normalize/league";
import { fetchLeague } from "../providers/api-sports/client";
import { CURATED_LEAGUES } from "./curated-leagues";

export async function ingestLeagues(apiKey: string, referenceDate = new Date()): Promise<void> {
  for (const config of CURATED_LEAGUES) {
    const raw = await fetchLeague(config.providerRef, apiKey);
    const leagueRowValues = { ...normalizeLeague(raw, config), updatedAt: new Date() };

    const [leagueRow] = await db
      .insert(league)
      .values(leagueRowValues)
      .onConflictDoUpdate({
        target: [league.provider, league.providerRef],
        set: leagueRowValues,
      })
      .returning({ id: league.id });
    if (!leagueRow) {
      throw new Error(`Failed to upsert league ${leagueRowValues.name}`);
    }

    const { current, previous } = pickSeasonsToSeed(raw.seasons, referenceDate);
    const normalizedSeasons = previous
      ? [normalizeSeason(current, true), normalizeSeason(previous, false)]
      : [normalizeSeason(current, true)];

    for (const normalizedSeason of normalizedSeasons) {
      await db
        .insert(season)
        .values({ ...normalizedSeason, leagueId: leagueRow.id })
        .onConflictDoUpdate({
          target: [season.leagueId, season.providerRef],
          set: normalizedSeason,
        });
    }

    // Exactly one season per league should be is_current — clear any older
    // season left over from a prior ingestion run that fell out of this
    // run's current/previous window.
    await db
      .update(season)
      .set({ isCurrent: false })
      .where(
        and(
          eq(season.leagueId, leagueRow.id),
          notInArray(
            season.providerRef,
            normalizedSeasons.map((s) => s.providerRef),
          ),
        ),
      );
  }
}
