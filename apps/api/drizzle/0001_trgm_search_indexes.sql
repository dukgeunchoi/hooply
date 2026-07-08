-- Trigram search support for docs/api-spec.md GET /v1/search (pg_trgm), per docs/data-model.md.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_name_trgm_idx" ON "team" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_full_name_trgm_idx" ON "player" USING gin ("full_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "league_name_trgm_idx" ON "league" USING gin ("name" gin_trgm_ops);
