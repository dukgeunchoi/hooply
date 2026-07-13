import { usePollingQuery } from "@/lib/usePollingQuery";
import { gamesResponseSchema } from "@hooply/shared";

const SLOW_POLL_INTERVAL_MS = 60_000;

// Returns the full envelope (not just `.data`) — the Scores screen needs
// `meta.delayed` for the "scores may be delayed" banner. Polls every 60s
// while the Scores screen is visible, regardless of live game state (issue
// #16).
export function useGames(date: string, { enabled = true }: { enabled?: boolean } = {}) {
  return usePollingQuery(["games", date], `/v1/games?date=${date}`, gamesResponseSchema, {
    enabled,
    intervalMs: SLOW_POLL_INTERVAL_MS,
  });
}
