# Hooply 🏀

Livescore basketball app — live scores, standings, schedules, box scores, team & player stats, favorites, and push notifications across the NBA and international leagues. Inspired by Fotmob, LiveScore, and OneFootball.

**Status:** planning complete, build starting (Phase 0).

## Planning docs

| Doc | What's in it |
|---|---|
| [System architecture](https://docs.google.com/document/d/1E878lJpd6crf6eDRW5XEwQlVCuoVNUFOrAxXB9IjdYs/edit) | High-level MVP architecture & decisions (Google Doc) |
| [docs/stack.md](docs/stack.md) | Tech stack decisions + scaffold order |
| [docs/data-model.md](docs/data-model.md) | Canonical schema, indexes, Redis keys, change events |
| [docs/api-spec.md](docs/api-spec.md) | REST API: endpoints, envelope, polling contract |
| [docs/screens.md](docs/screens.md) | Mobile screen map with per-screen data needs |
| [docs/provider-decision.md](docs/provider-decision.md) | Data provider comparison (Highlightly vs API-Sports) |

## Roadmap

Tracked as [issues #1–#9](../../issues), one per phase: Foundations → Data layer & ingestion → Backend API → Notifications → Mobile app → Testing & QA → App Store prep → Launch → Post-launch.

## Stack (short version)

TypeScript monorepo (pnpm): Express + Drizzle API, Node ingestion worker, Expo (React Native) app. Postgres + Redis on Railway. Expo Push for notifications. See [docs/stack.md](docs/stack.md) for the reasoning.
