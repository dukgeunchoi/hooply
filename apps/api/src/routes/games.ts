import { db, game, league, redis } from "@hooply/db";
import type { GamesResponse, LiveGame } from "@hooply/shared";
import { liveGameSnapshotSchema, makeEnvelope, makeErrorEnvelope } from "@hooply/shared";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { Router } from "express";
import { isStale } from "../lib/freshness";
import { DATE_PARAM_RE } from "../lib/validation";
import { awayTeam, homeTeam, serializeGameRow } from "./game-serialization";

// While a game is live its data should be at most ~60s old; other statuses
// (scheduled/final/etc.) don't tick, so only live rows can make the
// response "delayed" (see docs/api-spec.md).
const LIVE_STALE_THRESHOLD_MS = 60 * 1000;

export function isDelayed(
  rows: { status: string; updatedAt: Date }[],
  now: Date,
  thresholdMs = LIVE_STALE_THRESHOLD_MS,
): boolean {
  const liveUpdatedAts = rows.filter((r) => r.status === "live").map((r) => r.updatedAt);
  return isStale(liveUpdatedAts, now, thresholdMs);
}

async function readLiveGames(): Promise<{ games: LiveGame[]; updatedAts: Date[] }> {
  const keys = await redis.keys("live:game:*");
  if (keys.length === 0) return { games: [], updatedAts: [] };

  const raw = await redis.mget(...keys);
  const games: LiveGame[] = [];
  const updatedAts: Date[] = [];
  for (const value of raw) {
    if (!value) continue; // key expired between KEYS and MGET

    // A malformed snapshot is a worker-side bug, not a client error — per
    // architecture invariant #5 ("provider outage → last-known data, never
    // an error"), one bad key degrades to "one fewer live game" rather than
    // 500ing the whole feed.
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(value);
    } catch {
      continue;
    }
    const result = liveGameSnapshotSchema.safeParse(parsedJson);
    if (!result.success) continue;

    const snapshot = result.data;
    games.push({
      id: snapshot.id,
      status: snapshot.status,
      period: snapshot.period,
      clock: snapshot.clock,
      home: { score: snapshot.homeScore },
      away: { score: snapshot.awayScore },
    });
    updatedAts.push(new Date(snapshot.updatedAt));
  }
  return { games, updatedAts };
}

export function createGamesRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const dateParam = req.query.date;
    if (typeof dateParam !== "string" || !DATE_PARAM_RE.test(dateParam)) {
      res
        .status(400)
        .json(makeErrorEnvelope("bad_request", "date query param is required as YYYY-MM-DD"));
      return;
    }

    const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        gameId: game.id,
        status: game.status,
        tipoffAt: game.tipoffAt,
        period: game.period,
        clock: game.clock,
        venue: game.venue,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        updatedAt: game.updatedAt,
        leagueId: league.id,
        leagueName: league.name,
        leaguePriority: league.priority,
        leagueLogoUrl: league.logoUrl,
        homeTeamId: homeTeam.id,
        homeTeamName: homeTeam.name,
        homeTeamCode: homeTeam.code,
        homeTeamLogoUrl: homeTeam.logoUrl,
        awayTeamId: awayTeam.id,
        awayTeamName: awayTeam.name,
        awayTeamCode: awayTeam.code,
        awayTeamLogoUrl: awayTeam.logoUrl,
      })
      .from(game)
      .innerJoin(league, eq(game.leagueId, league.id))
      .innerJoin(homeTeam, eq(game.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(game.awayTeamId, awayTeam.id))
      .where(and(gte(game.tipoffAt, dayStart), lt(game.tipoffAt, dayEnd)))
      .orderBy(asc(league.priority), asc(game.tipoffAt));

    const groups = new Map<string, GamesResponse["data"][number]>();
    for (const r of rows) {
      let group = groups.get(r.leagueId);
      if (!group) {
        group = {
          league: { id: r.leagueId, name: r.leagueName, logo_url: r.leagueLogoUrl },
          games: [],
        };
        groups.set(r.leagueId, group);
      }
      group.games.push(serializeGameRow(r));
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json(
      makeEnvelope(Array.from(groups.values()), {
        delayed: isDelayed(rows, new Date()),
      }),
    );
  });

  router.get("/live", async (_req, res) => {
    const { games, updatedAts } = await readLiveGames();

    res.set("Cache-Control", "no-store");
    res.json(
      makeEnvelope(games, {
        delayed: isStale(updatedAts, new Date(), LIVE_STALE_THRESHOLD_MS),
      }),
    );
  });

  return router;
}
