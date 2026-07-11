import { apiGet } from "@/lib/api";
import { gamesResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

export function useGames(date: string) {
  return useQuery({
    queryKey: ["games", date],
    queryFn: async () => (await apiGet(`/v1/games?date=${date}`, gamesResponseSchema)).data,
  });
}
