import { apiGet } from "@/lib/api";
import { playerGameLogResponseSchema } from "@hooply/shared";
import { useInfiniteQuery } from "@tanstack/react-query";

// GET /v1/players/{id}/stats?cursor= — paginated game log (docs/screens.md's
// Player Page). Each page's meta.next_cursor feeds the next page param
// directly; `undefined` (no cursor yet) fetches the first page.
export function usePlayerGameLog(playerId: string) {
  return useInfiniteQuery({
    queryKey: ["player-game-log", playerId],
    queryFn: async ({ pageParam }) => {
      const path = pageParam
        ? `/v1/players/${playerId}/stats?cursor=${encodeURIComponent(pageParam)}`
        : `/v1/players/${playerId}/stats`;
      return apiGet(path, playerGameLogResponseSchema);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.next_cursor ?? undefined,
  });
}
