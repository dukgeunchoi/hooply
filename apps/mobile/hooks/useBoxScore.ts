import { ApiError, apiGet } from "@/lib/api";
import { pollingQueryConfig } from "@/lib/usePollingQuery";
import { type BoxScoreResponse, boxScoreResponseSchema } from "@hooply/shared";
import { useQuery } from "@tanstack/react-query";

const BOXSCORE_POLL_INTERVAL_MS = 30_000;

// A 404 here means "not yet available" per docs/api-spec.md, not an error —
// so it's caught and turned into `{ available: false }` rather than left to
// surface as a query error the way every other 4xx does.
export type BoxScoreResult = { available: true; envelope: BoxScoreResponse } | { available: false };

async function fetchBoxScore(gameId: string): Promise<BoxScoreResult> {
  try {
    const envelope = await apiGet(`/v1/games/${gameId}/boxscore`, boxScoreResponseSchema);
    return { available: true, envelope };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { available: false };
    throw err;
  }
}

// GET /v1/games/{id}/boxscore. `enabled` fetches it once whenever the game
// screen is visible — the Summary tab's top performers need this data too,
// not just the Box Score tab — while `poll` gates the ~30s refetch cadence
// to only when the Box Score tab is the active tab and the game is live
// (issue #18 acceptance criteria).
export function useBoxScore(
  gameId: string,
  { enabled, poll }: { enabled: boolean; poll: boolean },
) {
  return useQuery({
    queryKey: ["boxscore", gameId],
    queryFn: () => fetchBoxScore(gameId),
    ...pollingQueryConfig<BoxScoreResult>(enabled, () =>
      poll ? BOXSCORE_POLL_INTERVAL_MS : false,
    ),
  });
}
