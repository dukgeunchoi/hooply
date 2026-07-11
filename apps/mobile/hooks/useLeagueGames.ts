import { apiGet } from "@/lib/api";
import { leagueGamesResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useLeagueGames(leagueId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["league-games", leagueId, from, to],
    queryFn: async () =>
      (
        await apiGet(
          `/v1/leagues/${leagueId}/games?from=${from}&to=${to}`,
          leagueGamesResponseSchema,
        )
      ).data,
  });
}
