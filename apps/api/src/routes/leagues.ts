import { queries } from "@hooply/db";
import { UUID_RE, makeEnvelope, makeErrorEnvelope } from "@hooply/shared";
import { Router } from "express";
import { DATE_PARAM_RE } from "../lib/validation";

type LeaguesQueries = Pick<
  typeof queries,
  | "getActiveLeagues"
  | "getLeagueById"
  | "getSeasonById"
  | "getCurrentSeason"
  | "getStandingsForSeason"
  | "getGamesForLeagueRange"
>;

// `leaguesQueries` defaults to the real Postgres-backed read model
// (`@hooply/db`'s `queries`) but can be swapped for a fake in tests — the
// route itself only does param parsing, 404/400 branching, and envelope
// wrapping; the join/staleness/season-resolution logic lives in the query
// module.
export function createLeaguesRouter(leaguesQueries: LeaguesQueries = queries): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const { leagues, delayed } = await leaguesQueries.getActiveLeagues();

    res.set("Cache-Control", "public, max-age=3600");
    res.json(makeEnvelope(leagues, { delayed }));
  });

  router.get("/:id/standings", async (req, res) => {
    const leagueRow = await leaguesQueries.getLeagueById(req.params.id);
    if (!leagueRow) {
      res.status(404).json(makeErrorEnvelope("not_found", "League not found"));
      return;
    }

    const seasonParam = req.query.season;
    let seasonId: string | undefined;
    if (typeof seasonParam === "string") {
      if (!UUID_RE.test(seasonParam)) {
        res.status(400).json(makeErrorEnvelope("bad_request", "season query param must be a UUID"));
        return;
      }
      const seasonRow = await leaguesQueries.getSeasonById(seasonParam, leagueRow.id);
      if (!seasonRow) {
        res
          .status(400)
          .json(makeErrorEnvelope("bad_request", "season does not belong to this league"));
        return;
      }
      seasonId = seasonRow.id;
    } else {
      const currentSeason = await leaguesQueries.getCurrentSeason(leagueRow.id);
      seasonId = currentSeason?.id;
    }

    if (!seasonId) {
      // No current season seeded yet — not an error, just nothing to show.
      res.set("Cache-Control", "public, max-age=300");
      res.json(makeEnvelope([]));
      return;
    }

    const { standings, delayed } = await leaguesQueries.getStandingsForSeason(seasonId);

    res.set("Cache-Control", "public, max-age=300");
    res.json(makeEnvelope(standings, { delayed }));
  });

  router.get("/:id/games", async (req, res) => {
    const leagueRow = await leaguesQueries.getLeagueById(req.params.id);
    if (!leagueRow) {
      res.status(404).json(makeErrorEnvelope("not_found", "League not found"));
      return;
    }

    const fromParam = req.query.from;
    const toParam = req.query.to;
    if (
      typeof fromParam !== "string" ||
      typeof toParam !== "string" ||
      !DATE_PARAM_RE.test(fromParam) ||
      !DATE_PARAM_RE.test(toParam)
    ) {
      res
        .status(400)
        .json(
          makeErrorEnvelope("bad_request", "from and to query params are required as YYYY-MM-DD"),
        );
      return;
    }

    const rangeStart = new Date(`${fromParam}T00:00:00.000Z`);
    const rangeEnd = new Date(`${toParam}T00:00:00.000Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1); // `to` is inclusive of that whole day

    if (rangeEnd <= rangeStart) {
      res.status(400).json(makeErrorEnvelope("bad_request", "from must not be after to"));
      return;
    }

    const { games, delayed } = await leaguesQueries.getGamesForLeagueRange(
      leagueRow.id,
      fromParam,
      toParam,
    );

    res.set("Cache-Control", "public, max-age=300");
    res.json(makeEnvelope(games, { delayed }));
  });

  return router;
}
