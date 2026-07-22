import { apiGet } from "@/lib/api";
import { teamGamesResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useTeamGames(teamId: string, window: "upcoming" | "past") {
  return useQuery({
    queryKey: ["team-games", teamId, window],
    queryFn: async () =>
      (await apiGet(`/v1/teams/${teamId}/games?window=${window}`, teamGamesResponseSchema)).data,
  });
}
