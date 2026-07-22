import { queries } from "@hooply/db";
import { UUID_RE, makeEnvelope, makeErrorEnvelope } from "@hooply/shared";
import { Router } from "express";

type PlayersQueries = Pick<typeof queries, "getPlayerById" | "getPlayerGameLog">;

// The cursor is an opaque ISO timestamp (a game's tipoff_at) minted by
// queries/players.ts — this only checks it parses as a date, not that it's
// one this endpoint actually issued.
function isWellFormedCursor(raw: string): boolean {
  return !Number.isNaN(Date.parse(raw));
}

// `playersQueries` defaults to the real Postgres-backed read model
// (`@hooply/db`'s `queries`) but can be swapped for a fake in tests — the
// route itself only does param parsing, 404/400 branching, and envelope
// wrapping; the aggregation/pagination logic lives in the query module.
export function createPlayersRouter(playersQueries: PlayersQueries = queries): Router {
  const router = Router();

  router.get("/:id", async (req, res) => {
    const profile = await playersQueries.getPlayerById(req.params.id);
    if (!profile) {
      res.status(404).json(makeErrorEnvelope("not_found", "Player not found"));
      return;
    }

    res.set("Cache-Control", "public, max-age=3600");
    res.json(makeEnvelope(profile));
  });

  router.get("/:id/stats", async (req, res) => {
    const seasonParam = req.query.season;
    let seasonId: string | undefined;
    if (typeof seasonParam === "string") {
      if (!UUID_RE.test(seasonParam)) {
        res.status(400).json(makeErrorEnvelope("bad_request", "season query param must be a UUID"));
        return;
      }
      seasonId = seasonParam;
    }

    const cursorParam = req.query.cursor;
    let cursor: string | undefined;
    if (typeof cursorParam === "string") {
      if (!isWellFormedCursor(cursorParam)) {
        res.status(400).json(makeErrorEnvelope("bad_request", "cursor query param is malformed"));
        return;
      }
      cursor = cursorParam;
    }

    const page = await playersQueries.getPlayerGameLog(req.params.id, { seasonId, cursor });
    if (!page) {
      res.status(404).json(makeErrorEnvelope("not_found", "Player not found"));
      return;
    }

    res.set("Cache-Control", "public, max-age=3600");
    res.json(makeEnvelope(page.rows, { next_cursor: page.nextCursor }));
  });

  return router;
}
