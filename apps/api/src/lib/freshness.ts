// Shared "is this response stale" check used by every route that sets
// meta.delayed (see docs/api-spec.md). A single stale row (e.g. one
// league's ingestion silently failing) should surface as delayed even if
// everything else is fresh, so this always takes the oldest timestamp.
export function isStale(updatedAts: Date[], now: Date, thresholdMs: number): boolean {
  if (updatedAts.length === 0) return false;
  const stalest = Math.min(...updatedAts.map((d) => d.getTime()));
  return now.getTime() - stalest > thresholdMs;
}
