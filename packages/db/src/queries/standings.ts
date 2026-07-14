import type { StandingGroup } from "@hooply/shared";
import { STANDINGS_STALE_THRESHOLD_MS, isStale } from "@hooply/shared";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { season, standing, team } from "../schema/index";

export async function getSeasonById(
  seasonId: string,
  leagueId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: season.id })
    .from(season)
    .where(and(eq(season.id, seasonId), eq(season.leagueId, leagueId)));
  return row ?? null;
}

export async function getCurrentSeason(leagueId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: season.id })
    .from(season)
    .where(and(eq(season.leagueId, leagueId), eq(season.isCurrent, true)));
  return row ?? null;
}

export async function getStandingsForSeason(
  seasonId: string,
): Promise<{ standings: StandingGroup[]; delayed: boolean }> {
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

  const groups = new Map<string, StandingGroup>();
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

  return {
    standings: Array.from(groups.values()),
    delayed: isStale(
      rows.map((r) => r.updatedAt),
      new Date(),
      STANDINGS_STALE_THRESHOLD_MS,
    ),
  };
}
