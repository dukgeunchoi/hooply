import { queries } from "@hooply/db";
import { UUID_RE, makeEnvelope, makeErrorEnvelope } from "@hooply/shared";
import { Router } from "express";

type TeamsQueries = Pick<typeof queries, "getTeamById" | "getTeamGames" | "getTeamRoster">;

const DEFAULT_GAMES_LIMIT = 10;
const MAX_GAMES_LIMIT = 50;

// `undefined` (param omitted) falls back to the doc-specified default;
// anything present but not a positive integer within bounds is a 400.
function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return DEFAULT_GAMES_LIMIT;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (n < 1 || n > MAX_GAMES_LIMIT) return null;
  return n;
}

// `teamsQueries` defaults to the real Postgres-backed read model
// (`@hooply/db`'s `queries`) but can be swapped for a fake in tests — the
// route itself only does param parsing, 404/400 branching, and envelope
// wrapping; the join/staleness logic lives in the query module.
export function createTeamsRouter(teamsQueries: TeamsQueries = queries): Router {
  const router = Router();

  router.get("/:id", async (req, res) => {
    const teamProfile = await teamsQueries.getTeamById(req.params.id);
    if (!teamProfile) {
      res.status(404).json(makeErrorEnvelope("not_found", "Team not found"));
      return;
    }

    res.set("Cache-Control", "public, max-age=3600");
    res.json(makeEnvelope(teamProfile));
  });

  router.get("/:id/games", async (req, res) => {
    const windowParam = req.query.window;
    if (windowParam !== "upcoming" && windowParam !== "past") {
      res
        .status(400)
        .json(makeErrorEnvelope("bad_request", "window query param must be upcoming or past"));
      return;
    }

    const limit = parseLimit(req.query.limit);
    if (limit === null) {
      res
        .status(400)
        .json(makeErrorEnvelope("bad_request", "limit query param must be a positive integer"));
      return;
    }

    const games = await teamsQueries.getTeamGames(req.params.id, windowParam, limit);
    if (!games) {
      res.status(404).json(makeErrorEnvelope("not_found", "Team not found"));
      return;
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json(makeEnvelope(games));
  });

  router.get("/:id/roster", async (req, res) => {
    // `season` is part of the documented contract (docs/api-spec.md) but
    // isn't filterable yet — see the comment on getTeamRoster for why. Still
    // validated here so a malformed value 400s instead of being silently
    // accepted, same as every other id-shaped query param in this API.
    const seasonParam = req.query.season;
    if (typeof seasonParam === "string" && !UUID_RE.test(seasonParam)) {
      res.status(400).json(makeErrorEnvelope("bad_request", "season query param must be a UUID"));
      return;
    }

    const roster = await teamsQueries.getTeamRoster(req.params.id);
    if (!roster) {
      res.status(404).json(makeErrorEnvelope("not_found", "Team not found"));
      return;
    }

    res.set("Cache-Control", "public, max-age=3600");
    res.json(makeEnvelope(roster));
  });

  return router;
}
