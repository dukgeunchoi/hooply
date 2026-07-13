import { db, game, league, season, standing, team } from "@hooply/db";
import type { StandingsResponse } from "@hooply/shared";
import { makeEnvelope, makeErrorEnvelope } from "@hooply/shared";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { Router } from "express";
import { isStale } from "../lib/freshness";
import { DATE_PARAM_RE } from "../lib/validation";
import { awayTeam, homeTeam, serializeGameRow } from "./game-serialization";
import { isDelayed } from "./games";

// Ingestion runs once on startup and leagues rarely change, so "fresh" gets
// a much longer window than the ~60s used for live game data.
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Standings ingestion runs a few times a day (issue #15), not continuously
// — a window comparable to half that cadence surfaces a silently-broken
// job well before a full day goes by, without false-positiving on the
// normal gap between runs.
const STANDINGS_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findLeagueId(rawId: string): Promise<string | null> {
  if (!UUID_RE.test(rawId)) return null;
  const [row] = await db.select({ id: league.id }).from(league).where(eq(league.id, rawId));
  return row?.id ?? null;
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
      // `priority` isn't unique — tie-break on id so ties can't reorder between
      // requests (Postgres doesn't guarantee tie order is stable across writes,
      // and an unstable order can swap rows out from under an in-flight tap on
      // the mobile Leagues list; see #26).
      .orderBy(asc(league.priority), asc(league.id));

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
        delayed: isStale(
          rows.map((r) => r.updatedAt),
          new Date(),
          STALE_THRESHOLD_MS,
        ),
      }),
    );
  });

  router.get("/:id/standings", async (req, res) => {
    const leagueId = await findLeagueId(req.params.id);
    if (!leagueId) {
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
      const [seasonRow] = await db
        .select({ id: season.id })
        .from(season)
        .where(and(eq(season.id, seasonParam), eq(season.leagueId, leagueId)));
      if (!seasonRow) {
        res
          .status(400)
          .json(makeErrorEnvelope("bad_request", "season does not belong to this league"));
        return;
      }
      seasonId = seasonRow.id;
    } else {
      const [currentSeason] = await db
        .select({ id: season.id })
        .from(season)
        .where(and(eq(season.leagueId, leagueId), eq(season.isCurrent, true)));
      seasonId = currentSeason?.id;
    }

    if (!seasonId) {
      // No current season seeded yet — not an error, just nothing to show.
      res.set("Cache-Control", "public, max-age=300");
      res.json(makeEnvelope([]));
      return;
    }

    const rows = await db
      .select({
        rank: standing.rank,
        played: standing.played,
        wins: standing.wins,
        losses: standing.losses,
        winPct: standing.winPct,
        pointsFor: standing.pointsFor,
        pointsAgainst: standing.pointsAgainst,
        streak: standing.streak,
        gamesBehind: standing.gamesBehind,
        conference: standing.conference,
        groupName: standing.groupName,
        updatedAt: standing.updatedAt,
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        teamLogoUrl: team.logoUrl,
      })
      .from(standing)
      .innerJoin(team, eq(standing.teamId, team.id))
      .where(eq(standing.seasonId, seasonId))
      .orderBy(asc(standing.conference), asc(standing.groupName), asc(standing.rank));

    const groups = new Map<string, StandingsResponse["data"][number]>();
    for (const r of rows) {
      const label = r.conference ?? r.groupName ?? "";
      let group = groups.get(label);
      if (!group) {
        group = { label: label || null, standings: [] };
        groups.set(label, group);
      }
      group.standings.push({
        rank: r.rank,
        team: { id: r.teamId, name: r.teamName, code: r.teamCode, logo_url: r.teamLogoUrl },
        played: r.played,
        wins: r.wins,
        losses: r.losses,
        win_pct: Number(r.winPct),
        points_for: r.pointsFor,
        points_against: r.pointsAgainst,
        games_behind: r.gamesBehind === null ? null : Number(r.gamesBehind),
        streak: r.streak,
      });
    }

    res.set("Cache-Control", "public, max-age=300");
    res.json(
      makeEnvelope(Array.from(groups.values()), {
        delayed: isStale(
          rows.map((r) => r.updatedAt),
          new Date(),
          STANDINGS_STALE_THRESHOLD_MS,
        ),
      }),
    );
  });

  router.get("/:id/games", async (req, res) => {
    const leagueId = await findLeagueId(req.params.id);
    if (!leagueId) {
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
      .innerJoin(homeTeam, eq(game.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(game.awayTeamId, awayTeam.id))
      .where(
        and(
          eq(game.leagueId, leagueId),
          gte(game.tipoffAt, rangeStart),
          lt(game.tipoffAt, rangeEnd),
        ),
      )
      .orderBy(asc(game.tipoffAt));

    res.set("Cache-Control", "public, max-age=300");
    res.json(
      makeEnvelope(rows.map(serializeGameRow), {
        delayed: isDelayed(rows, new Date()),
      }),
    );
  });

  return router;
}
