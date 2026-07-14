import type { League } from "@hooply/shared";
import { LEAGUE_STALE_THRESHOLD_MS, UUID_RE, isStale } from "@hooply/shared";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { league, season } from "../schema/index";

export async function getActiveLeagues(): Promise<{ leagues: League[]; delayed: boolean }> {
  const rows = await db
    .select({
      id: league.id,
      name: league.name,
      country: league.country,
      logoUrl: league.logoUrl,
      priority: league.priority,
      updatedAt: league.updatedAt,
      currentSeasonId: season.id,
    })
    .from(league)
    .leftJoin(season, and(eq(season.leagueId, league.id), eq(season.isCurrent, true)))
    .where(eq(league.isActive, true))
    // `priority` isn't unique — tie-break on id so ties can't reorder between
    // requests (Postgres doesn't guarantee tie order is stable across writes,
    // and an unstable order can swap rows out from under an in-flight tap on
    // the mobile Leagues list; see #26).
    .orderBy(asc(league.priority), asc(league.id));

  const leagues: League[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    logo_url: r.logoUrl,
    priority: r.priority,
    current_season_id: r.currentSeasonId,
  }));

  return {
    leagues,
    delayed: isStale(
      rows.map((r) => r.updatedAt),
      new Date(),
      LEAGUE_STALE_THRESHOLD_MS,
    ),
  };
}

// Defensive against a malformed path-param id: a non-uuid literal would
// otherwise make Postgres throw, turning a would-be 404 into a 500.
export async function getLeagueById(rawId: string): Promise<{ id: string } | null> {
  if (!UUID_RE.test(rawId)) return null;
  const [row] = await db.select({ id: league.id }).from(league).where(eq(league.id, rawId));
  return row ?? null;
}
