import { apiGet } from "@/lib/api";
import { standingsResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useLeagueStandings(leagueId: string) {
  return useQuery({
    queryKey: ["league-standings", leagueId],
    queryFn: async () =>
      (await apiGet(`/v1/leagues/${leagueId}/standings`, standingsResponseSchema)).data,
  });
}
