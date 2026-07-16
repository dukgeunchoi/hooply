import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet } from "./api";
import { pollingRetryDelay, shouldRetryPollingError } from "./polling";

// The `enabled`/`refetchInterval`/retry shape shared by every "poll while
// the screen is visible" query (see issue #16): `enabled: false` stops
// refetching outright rather than pausing, and 429/5xx get the same
// backoff everywhere. Factored out so a query with its own custom `queryFn`
// (e.g. useBoxScore's 404-swallowing fetch, issue #18) can still share this
// behavior instead of re-declaring it.
export function pollingQueryConfig<TData>(
  enabled: boolean,
  intervalMs: number | ((data: TData | undefined) => number | false),
): {
  enabled: boolean;
  refetchInterval: false | ((query: { state: { data: TData | undefined } }) => number | false);
  refetchIntervalInBackground: false;
  retry: typeof shouldRetryPollingError;
  retryDelay: typeof pollingRetryDelay;
} {
  return {
    enabled,
    refetchInterval: enabled
      ? (query: { state: { data: TData | undefined } }) =>
          typeof intervalMs === "function" ? intervalMs(query.state.data) : intervalMs
      : false,
    refetchIntervalInBackground: false,
    retry: shouldRetryPollingError,
    retryDelay: pollingRetryDelay,
  };
}

// `intervalMs` can also be a function of the last response — e.g. the Game
// Detail screen (#17) only wants to keep polling while the fetched game is
// still live.
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
    ...pollingQueryConfig(enabled, intervalMs),
  });
}
