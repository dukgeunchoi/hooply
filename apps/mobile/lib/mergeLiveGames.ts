import type { Game, LeagueGames, LiveGame } from "@hooply/shared";

// The fast /v1/games/live poll only carries the fields that change while a
// game is live (see packages/shared/src/game.ts) — everything else (team
// refs, tipoff_at, venue) is left as the slow /v1/games poll last reported.
function mergeLiveGame(game: Game, live: LiveGame | undefined): Game {
  if (!live) return game;
  return {
    ...game,
    status: live.status,
    period: live.period,
    clock: live.clock,
    home: { ...game.home, score: live.home.score },
    away: { ...game.away, score: live.away.score },
  };
}

export function mergeLiveGames(groups: LeagueGames[], liveGames: LiveGame[]): LeagueGames[] {
  if (liveGames.length === 0) return groups;
  const liveById = new Map(liveGames.map((g) => [g.id, g]));
  return groups.map((group) => ({
    ...group,
    games: group.games.map((game) => mergeLiveGame(game, liveById.get(game.id))),
  }));
}

// Gates the fast poll: "starts when the slow poll response contains a live
// game" (issue #16) — deliberately reads the slow poll's own status, not
// the merged view, so the gate can't be kept alive by the fast poll's own
// (increasingly stale) data once the slow poll has moved on.
export function hasLiveGame(groups: LeagueGames[]): boolean {
  return groups.some((group) => group.games.some((game) => game.status === "live"));
}
