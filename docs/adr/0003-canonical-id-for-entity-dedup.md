# Canonical ID self-reference for provider entity dedup

`team` and `player` carry a `canonical_id uuid nullable` self-reference. When the ingestion worker detects a likely duplicate — same real-world entity, different `provider_ref` — it flags the duplicate rather than silently inserting a new row. A reconciliation step sets `canonical_id` on the non-authoritative row, pointing to the canonical one. All application queries filter `WHERE canonical_id IS NULL`.

Providers are known to silently re-issue entity IDs across seasons (API-Sports teams, player transfers). Without this mechanism, the ingestion worker's `WHERE provider = $1 AND provider_ref = $2` lookup would insert ghost rows, and every foreign key referencing the old row would silently point to stale data. The `external_ids jsonb` column handles multi-provider migrations but does not protect against same-provider ID drift.

The self-reference is surprising at first glance — it looks like a parent/child tree. It isn't; it's a dedup pointer. A `canonical_id IS NOT NULL` row is a retired alias, never returned by queries.

## Consequences

The Phase 0 provider spike must test `provider_ref` stability across seasons before ingestion is built around the assumption of stability.
