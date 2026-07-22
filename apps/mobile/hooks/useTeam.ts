import { apiGet } from "@/lib/api";
import { teamProfileResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useTeam(teamId: string) {
  return useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => (await apiGet(`/v1/teams/${teamId}`, teamProfileResponseSchema)).data,
  });
}
