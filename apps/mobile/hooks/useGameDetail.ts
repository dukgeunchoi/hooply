import { usePollingQuery } from "@/lib/usePollingQuery";
import { gameDetailResponseSchema } from "@hooply/shared";

const LIVE_POLL_INTERVAL_MS = 15_000;

// GET /v1/games/{id}: fetched once whenever the screen is visible (`enabled`
// gates that, same as the Scores screen's polling), then re-polled every
// 10-15s only while the *fetched* game is live (issue #17) — unlike the
// Scores screen, the gate here comes from this query's own last response
// rather than an external flag, so it stops itself once the game goes final.
export function useGameDetail(gameId: string, { enabled }: { enabled: boolean }) {
  return usePollingQuery(["game", gameId], `/v1/games/${gameId}`, gameDetailResponseSchema, {
    enabled,
    intervalMs: (data) => (data?.data.status === "live" ? LIVE_POLL_INTERVAL_MS : false),
  });
}
