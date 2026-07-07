# Hooply — Tech Stack (MVP)

Status: Draft for review · Date: 2026-07-06
Relates to: Phase 0 (issue #1). Constraint: solo dev, ship fast, one language everywhere.

## Summary

| Layer | Pick | Why |
|---|---|---|
| Language | TypeScript everywhere | one language across app, API, worker, shared types |
| Monorepo | pnpm workspaces | `apps/api`, `apps/worker`, `apps/mobile`, `packages/shared` |
| Backend framework | Express | familiar, massive ecosystem, flexible middleware; Zod handles request validation via packages/shared schemas |
| ORM / migrations | Drizzle | SQL-first, thin, migrations included; our schema is hand-designed relational so closeness to SQL beats magic. (Prisma is the acceptable alternative if DX is preferred) |
| Datastores | Postgres 16 + Redis 7 | per architecture doc |
| Mobile | Expo (managed) + EAS Build | fastest path for a solo dev: no native Xcode/Gradle wrangling, OTA updates, EAS handles signing/TestFlight |
| Navigation | Expo Router | file-based, deep links (`hooply://game/{id}`) nearly free |
| Server state | TanStack Query | `refetchInterval` gives us the 10–15s polling contract with visibility-awareness out of the box |
| Local state/storage | Zustand + MMKV | favorites, device_id, notification prefs, recent searches |
| Push notifications | **Expo Push Service** | one API for APNs+FCM, no certificate juggling; worker calls Expo's API with the device's Expo push token. Revisit raw APNs/FCM only if delivery latency disappoints |
| Ingestion worker | plain Node process (node-cron) | no queue in MVP (per architecture doc); one process, tick every 15s during live windows, few minutes otherwise |
| Hosting | Railway | API + worker + Postgres + Redis in one project, ~$10–20/mo at MVP traffic, zero devops. (Fly.io/Render equivalent; Neon+Upstash if we want serverless DBs) |
| Lint/format | Biome | one tool instead of ESLint+Prettier, near-zero config |
| Tests | Vitest + Supertest | unit (normalizers, diffing) + API integration; app E2E via Maestro post-MVP |
| Errors/monitoring | Sentry (app + api + worker) | free tier fine; plus a healthcheck ping on the worker's poll loop (dead-man switch — catches ingestion silently breaking, per Phase 5) |
| CI | GitHub Actions | typecheck, lint, tests on PR; EAS build on release tags |

## Repo layout

```
hooply/
├── apps/
│   ├── api/          # Fastify — routes, serialization, caching headers
│   ├── worker/       # ingestion: provider client, normalizers, diff, events, push
│   └── mobile/       # Expo app
├── packages/
│   └── shared/       # zod schemas + TS types for API payloads (single source of truth
│                     #   used by api serializers and mobile client)
├── docs/             # these planning docs
└── .github/workflows/
```

## Notable decisions & tradeoffs

**Expo Push vs raw APNs/FCM.** The architecture doc says "APNs/FCM setup" in Phase 3; Expo Push wraps both behind one HTTP API and removes cert/key management. Tradeoff: an extra hop (their infra) and a soft dependency on Expo. For game-start/score/final notifications, seconds of added latency are acceptable. The `device.push_token` column stores the Expo push token; nothing else changes in the data model.

**Worker and API as separate processes, same monorepo.** They share the Drizzle schema and `packages/shared` types but deploy as two Railway services, so a stuck poll loop can't take down the API. In-process events in the worker (poll → diff → notify) — the LISTEN/NOTIFY or queue upgrade is Path-to-Scale.

**No GraphQL** (spec'd REST in docs/api-spec.md), **no Next.js/web app**, **no Docker locally** (Railway builds from the repo; `docker-compose.yml` only for local Postgres+Redis).

**Supabase not used.** Fresh start dropped the earlier Supabase prototype; plain Postgres keeps the ingestion/diff layer unconstrained and Railway hosts it next to the services.

## What Claude Code should scaffold first (Phase 0 exit)

1. pnpm workspace + Biome + tsconfig base + GitHub Actions (typecheck/lint/test)
2. `docker-compose.yml` (Postgres + Redis) and Drizzle schema from docs/data-model.md, first migration
3. Express skeleton with `/v1/leagues` stub returning envelope format
4. Expo app skeleton with tab navigation matching docs/screens.md
5. Provider spike scripts (`apps/worker/spikes/`) hitting both providers' free tiers — answers the box-score question in docs/provider-decision.md
