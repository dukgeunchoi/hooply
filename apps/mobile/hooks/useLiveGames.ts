import { usePollingQuery } from "@/lib/usePollingQuery";
import { liveGamesResponseSchema } from "@hooply/shared";

const FAST_POLL_INTERVAL_MS = 15_000;

// `enabled` is the caller's fast-poll gate: visible screen AND the slow
// GET /v1/games poll currently contains a live game (see issue #16).
export function useLiveGames(enabled: boolean) {
  return usePollingQuery(["games", "live"], "/v1/games/live", liveGamesResponseSchema, {
    enabled,
    intervalMs: FAST_POLL_INTERVAL_MS,
  });
}
