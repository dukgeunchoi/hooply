import type { FavoriteEntityType, Game, LeagueGames } from "@hooply/shared";

type FavoriteRef = { entity_type: FavoriteEntityType; entity_id: string };

// Shared by the Scores screen ordering below and the Following screen
// (per-team "next game today" lookup, "Today for you" filter) so the
// "does this game involve team X" check isn't reimplemented at each site.
export function gameInvolvesTeam(game: Game, teamId: string): boolean {
  return game.home.team.id === teamId || game.away.team.id === teamId;
}

export function gameInvolvesAnyTeam(game: Game, teamIds: ReadonlySet<string>): boolean {
  return teamIds.has(game.home.team.id) || teamIds.has(game.away.team.id);
}

// Favorites-first ordering (docs/screens.md #1, issue #19 AC): leagues with
// a favorited team (or the league itself favorited) sort first, ties broken
// by the API's existing priority order; within a league group, games
// involving a followed team sort first. `Array.prototype.sort` is stable
// (ES2019+), so ties keep their original relative order — this is computed
// client-side since favorites only live on-device (docs/api-spec.md).
export function orderByFavorites(
  groups: readonly LeagueGames[],
  favorites: readonly FavoriteRef[],
): LeagueGames[] {
  const favoritedTeamIds = new Set(
    favorites.filter((f) => f.entity_type === "team").map((f) => f.entity_id),
  );
  const favoritedLeagueIds = new Set(
    favorites.filter((f) => f.entity_type === "league").map((f) => f.entity_id),
  );

  if (favoritedTeamIds.size === 0 && favoritedLeagueIds.size === 0) return [...groups];

  const reordered = groups.map((group) => ({
    ...group,
    games: [...group.games].sort(
      (a, b) =>
        Number(gameInvolvesAnyTeam(b, favoritedTeamIds)) -
        Number(gameInvolvesAnyTeam(a, favoritedTeamIds)),
    ),
  }));

  return reordered.sort((a, b) => {
    const aFavorited =
      favoritedLeagueIds.has(a.league.id) ||
      a.games.some((g) => gameInvolvesAnyTeam(g, favoritedTeamIds));
    const bFavorited =
      favoritedLeagueIds.has(b.league.id) ||
      b.games.some((g) => gameInvolvesAnyTeam(g, favoritedTeamIds));
    return Number(bFavorited) - Number(aFavorited);
  });
}
