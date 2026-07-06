# Hooply

Livescore basketball app (Fotmob/LiveScore/OneFootball, but for basketball): live scores, standings, schedules, game detail with box scores, team/player pages, favorites, push notifications. Solo dev, MVP targeting App Store launch.

## Read these before non-trivial work

- `docs/stack.md` — tech stack + **scaffold order** (start there for Phase 0)
- `docs/data-model.md` — canonical schema; ingestion normalizes INTO this, nothing outside the worker sees provider schemas
- `docs/api-spec.md` — REST endpoints, response envelope, polling contract
- `docs/screens.md` — mobile screens and their exact API calls
- `docs/provider-decision.md` — data provider status (spike pending)

Progress is tracked as GitHub issues #1–#9 (one per roadmap phase). Work through them in order; check off task items as completed.

## Architecture invariants (don't violate without discussion)

1. **Mobile app talks only to our API** — never to the data provider.
2. **Client polling, not WebSockets** (10–15s, only while a live screen is visible). Push notifications cover app-closed moments.
3. **No user accounts in MVP.** Favorites are on-device; server stores device token + favorites only for notification routing.
4. **Provider-agnostic core:** all provider-specific parsing lives in `apps/worker`'s normalization layer. Every synced row keeps `provider` + `provider_ref`.
5. **API reads only Postgres/Redis.** Provider outage → serve last-known data with `meta.delayed: true`, never an error.

## Stack

TypeScript everywhere. pnpm workspaces: `apps/api` (Fastify + Drizzle), `apps/worker` (ingestion, node-cron), `apps/mobile` (Expo + Expo Router + TanStack Query + Zustand/MMKV), `packages/shared` (zod schemas / API types). Postgres 16 + Redis 7 (local: docker-compose). Hosting: Railway. Push: Expo Push Service. Lint/format: Biome. Tests: Vitest (+ Supertest for API).

## Conventions

- All API responses use the envelope: `{ data, meta: { generated_at, delayed } }`; errors `{ error: { code, message } }`
- IDs exposed by the API are Hooply UUIDs, never provider refs
- Timestamps UTC ISO 8601; client localizes
- Store `seconds_played`, render minutes; `period_scores` is jsonb arrays
- Commit style: `feat:`, `fix:`, `docs:`, `chore:` prefixes
