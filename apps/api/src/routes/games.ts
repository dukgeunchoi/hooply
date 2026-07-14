import { queries, redis } from "@hooply/db";
import type { LiveGame } from "@hooply/shared";
import {
  LIVE_STALE_THRESHOLD_MS,
  isStale,
  liveGameSnapshotSchema,
  makeEnvelope,
  makeErrorEnvelope,
} from "@hooply/shared";
import { Router } from "express";
import { DATE_PARAM_RE } from "../lib/validation";

type GamesQueries = Pick<typeof queries, "getGamesForDate">;

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

// `gamesQueries` defaults to the real Postgres-backed read model
// (`@hooply/db`'s `queries`) but can be swapped for a fake in tests — the
// route itself only does param parsing and envelope wrapping, no join/
// staleness logic of its own.
export function createGamesRouter(gamesQueries: GamesQueries = queries): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const dateParam = req.query.date;
    if (typeof dateParam !== "string" || !DATE_PARAM_RE.test(dateParam)) {
      res
        .status(400)
        .json(makeErrorEnvelope("bad_request", "date query param is required as YYYY-MM-DD"));
      return;
    }

    const { leagues, delayed } = await gamesQueries.getGamesForDate(dateParam);

    res.set("Cache-Control", "public, max-age=300");
    res.json(makeEnvelope(leagues, { delayed }));
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
