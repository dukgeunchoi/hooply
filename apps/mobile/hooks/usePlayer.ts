import { apiGet } from "@/lib/api";
import { playerProfileResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function usePlayer(playerId: string) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: async () =>
      (await apiGet(`/v1/players/${playerId}`, playerProfileResponseSchema)).data,
  });
}
