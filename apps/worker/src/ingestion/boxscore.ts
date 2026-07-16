import { db, game, playerGameStat, team, teamGameStat } from "@hooply/db";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { normalizePlayerStat, normalizePlayerStub, normalizeTeamStat } from "../normalize/boxscore";
import { fetchBoxScorePlayers, fetchBoxScoreTeams } from "../providers/api-sports/client";
import { upsertPlayerStub } from "./players";

type GameRow = {
  id: string;
  providerRef: string;
  status: string;
};

async function resolveTeamIdsByProviderRef(providerRefs: string[]): Promise<Map<string, string>> {
  if (providerRefs.length === 0) return new Map();
  const rows = await db
    .select({ id: team.id, providerRef: team.providerRef })
    .from(team)
    .where(and(eq(team.provider, "api-sports"), inArray(team.providerRef, providerRefs)));
  return new Map(rows.map((r) => [r.providerRef, r.id]));
}

async function syncGameBoxScore(row: GameRow, apiKey: string, now: Date): Promise<void> {
  const [rawPlayers, rawTeams] = await Promise.all([
    fetchBoxScorePlayers(row.providerRef, apiKey),
    fetchBoxScoreTeams(row.providerRef, apiKey),
  ]);
  // The provider doesn't publish box score stats from the opening tip —
  // nothing to write yet, and stats_synced_at stays unset so the API keeps
  // 404ing until a real payload shows up.
  if (rawPlayers.length === 0 && rawTeams.length === 0) return;

  const normalizedPlayers = rawPlayers.map(normalizePlayerStat);
  const normalizedTeams = rawTeams.map(normalizeTeamStat);

  const teamProviderRefs = new Set([
    ...normalizedPlayers.map((p) => p.teamProviderRef),
    ...normalizedTeams.map((t) => t.teamProviderRef),
  ]);
  const teamIdByProviderRef = await resolveTeamIdsByProviderRef(Array.from(teamProviderRefs));

  for (const stat of normalizedPlayers) {
    const teamId = teamIdByProviderRef.get(stat.teamProviderRef);
    if (!teamId) continue; // team not resolvable — game ingestion should have seeded both teams already

    const playerId = await upsertPlayerStub(normalizePlayerStub(stat), teamId);

    const values = {
      gameId: row.id,
      playerId,
      teamId,
      secondsPlayed: stat.secondsPlayed,
      points: stat.points,
      assists: stat.assists,
      reboundsOff: stat.reboundsOff,
      reboundsDef: stat.reboundsDef,
      steals: stat.steals,
      blocks: stat.blocks,
      turnovers: stat.turnovers,
      fouls: stat.fouls,
      fgMade: stat.fgMade,
      fgAtt: stat.fgAtt,
      threeMade: stat.threeMade,
      threeAtt: stat.threeAtt,
      ftMade: stat.ftMade,
      ftAtt: stat.ftAtt,
      plusMinus: stat.plusMinus,
      isStarter: stat.isStarter,
    };

    await db
      .insert(playerGameStat)
      .values(values)
      .onConflictDoUpdate({
        target: [playerGameStat.gameId, playerGameStat.playerId],
        set: values,
      });
  }

  for (const stat of normalizedTeams) {
    const teamId = teamIdByProviderRef.get(stat.teamProviderRef);
    if (!teamId) continue;

    const values = {
      gameId: row.id,
      teamId,
      points: stat.points,
      assists: stat.assists,
      reboundsOff: stat.reboundsOff,
      reboundsDef: stat.reboundsDef,
      steals: stat.steals,
      blocks: stat.blocks,
      turnovers: stat.turnovers,
      fouls: stat.fouls,
      fgMade: stat.fgMade,
      fgAtt: stat.fgAtt,
      threeMade: stat.threeMade,
      threeAtt: stat.threeAtt,
      ftMade: stat.ftMade,
      ftAtt: stat.ftAtt,
    };

    await db
      .insert(teamGameStat)
      .values(values)
      .onConflictDoUpdate({ target: [teamGameStat.gameId, teamGameStat.teamId], set: values });
  }

  await db.update(game).set({ statsSyncedAt: now }).where(eq(game.id, row.id));
}

// Runs on the ~30s cron tick (issue #18). Candidates are every currently-live
// game (stats change possession by possession, so re-synced every tick) plus
// any `final` game that still needs its post-final resync: either it never
// synced at all (missed its whole live window) or its last box score sync
// predates the game's final transition (`game.updated_at`, bumped by
// syncGame on every status write) — i.e. the last sync happened while still
// live, and the provider may have posted final corrections since. Once a
// sync runs after that transition, stats_synced_at moves past updated_at
// and the game drops out of this query for good.
export async function ingestBoxScores(apiKey: string, now: Date = new Date()): Promise<void> {
  const rows: GameRow[] = await db
    .select({ id: game.id, providerRef: game.providerRef, status: game.status })
    .from(game)
    .where(
      or(
        eq(game.status, "live"),
        and(
          eq(game.status, "final"),
          or(isNull(game.statsSyncedAt), lt(game.statsSyncedAt, game.updatedAt)),
        ),
      ),
    );

  for (const row of rows) {
    await syncGameBoxScore(row, apiKey, now);
  }
}
