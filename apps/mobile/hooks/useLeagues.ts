import { apiGet } from "@/lib/api";
import { leaguesResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useLeagues() {
  return useQuery({
    queryKey: ["leagues"],
    queryFn: async () => (await apiGet("/v1/leagues", leaguesResponseSchema)).data,
  });
}
