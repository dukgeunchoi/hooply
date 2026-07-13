import { ApiError } from "./api";

// 429/5xx are transient (rate limit or an infra/provider hiccup) — worth
// retrying. Any other error (4xx, network failure, schema mismatch) means
// retrying the same request won't help, so let it surface instead of
// silently spinning.
export function shouldRetryPollingError(_failureCount: number, error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 429 || error.status >= 500;
}

// Backoff starting at 30s per docs/api-spec.md's polling contract, doubling
// from there with a 5-minute ceiling so a prolonged outage doesn't drift
// into hour-long gaps.
export function pollingRetryDelay(attemptIndex: number): number {
  return Math.min(30_000 * 2 ** attemptIndex, 5 * 60_000);
}
