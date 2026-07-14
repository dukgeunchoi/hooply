import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet } from "./api";
import { pollingRetryDelay, shouldRetryPollingError } from "./polling";

// Shared shape behind every "poll while the screen is visible" query (see
// issue #16): `enabled: false` stops refetching outright rather than
// pausing, and 429/5xx get the same backoff everywhere. `intervalMs` can
// also be a function of the last response — e.g. the Game Detail screen
// (#17) only wants to keep polling while the fetched game is still live.
export function usePollingQuery<T extends z.ZodTypeAny>(
  queryKey: readonly unknown[],
  path: string,
  schema: T,
  {
    enabled,
    intervalMs,
  }: {
    enabled: boolean;
    intervalMs: number | ((data: z.infer<T> | undefined) => number | false);
  },
) {
  return useQuery({
    queryKey,
    queryFn: () => apiGet(path, schema),
    enabled,
    refetchInterval: enabled
      ? (query) => (typeof intervalMs === "function" ? intervalMs(query.state.data) : intervalMs)
      : false,
    refetchIntervalInBackground: false,
    retry: shouldRetryPollingError,
    retryDelay: pollingRetryDelay,
  });
}
