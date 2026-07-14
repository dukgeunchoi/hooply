// Shared "is this response stale" check used by every route that sets
// meta.delayed (see docs/api-spec.md). A single stale row (e.g. one
// league's ingestion silently failing) should surface as delayed even if
// everything else is fresh, so this always takes the oldest timestamp.
export function isStale(updatedAts: Date[], now: Date, thresholdMs: number): boolean {
  if (updatedAts.length === 0) return false;
  const stalest = Math.min(...updatedAts.map((d) => d.getTime()));
  return now.getTime() - stalest > thresholdMs;
}

// While a game is live its data should be at most ~60s old; other statuses
// (scheduled/final/etc.) don't tick, so only live rows can make a games
// response "delayed" (see docs/api-spec.md). Also the redis-backed
// GET /v1/games/live route's own staleness threshold.
export const LIVE_STALE_THRESHOLD_MS = 60 * 1000;

// Ingestion runs once on startup and leagues rarely change, so "fresh" gets
// a much longer window than the ~60s used for live game data.
export const LEAGUE_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Standings ingestion runs a few times a day (issue #15), not continuously
// — a window comparable to half that cadence surfaces a silently-broken
// job well before a full day goes by, without false-positiving on the
// normal gap between runs.
export const STANDINGS_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;
