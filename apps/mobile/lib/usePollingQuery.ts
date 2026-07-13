import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { apiGet } from "./api";
import { pollingRetryDelay, shouldRetryPollingError } from "./polling";

// Shared shape behind every "poll while the Scores screen is visible" query
// (see issue #16): `enabled: false` stops refetching outright rather than
// pausing, and 429/5xx get the same backoff everywhere.
export function usePollingQuery<T extends z.ZodTypeAny>(
  queryKey: readonly unknown[],
  path: string,
  schema: T,
  { enabled, intervalMs }: { enabled: boolean; intervalMs: number },
) {
  return useQuery({
    queryKey,
    queryFn: () => apiGet(path, schema),
    enabled,
    refetchInterval: enabled ? intervalMs : false,
    refetchIntervalInBackground: false,
    retry: shouldRetryPollingError,
    retryDelay: pollingRetryDelay,
  });
}
