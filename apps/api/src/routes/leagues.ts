import { db, league, season } from "@hooply/db";
import { makeEnvelope } from "@hooply/shared";
import { and, asc, eq } from "drizzle-orm";
import { Router } from "express";

// Ingestion runs once on startup and leagues rarely change, so "fresh" gets
// a much longer window than the ~60s used for live game data.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function isDelayed(
  updatedAts: Date[],
  now: Date,
  thresholdMs = STALE_THRESHOLD_MS,
): boolean {
  if (updatedAts.length === 0) return false;
  // A single stale row (e.g. one league's ingestion silently failing) should
  // surface as delayed even if other leagues are fresh — take the oldest.
  const stalest = Math.min(...updatedAts.map((d) => d.getTime()));
  return now.getTime() - stalest > thresholdMs;
}

export function createLeaguesRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
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
      .orderBy(asc(league.priority));

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country,
      logo_url: r.logoUrl,
      priority: r.priority,
      current_season_id: r.currentSeasonId,
    }));

    res.set("Cache-Control", "public, max-age=3600");
    res.json(
      makeEnvelope(data, {
        delayed: isDelayed(
          rows.map((r) => r.updatedAt),
          new Date(),
        ),
      }),
    );
  });

  return router;
}
