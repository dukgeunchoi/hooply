import { apiGet } from "@/lib/api";
import { teamRosterResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useTeamRoster(teamId: string) {
  return useQuery({
    queryKey: ["team-roster", teamId],
    queryFn: async () =>
      (await apiGet(`/v1/teams/${teamId}/roster`, teamRosterResponseSchema)).data,
  });
}
