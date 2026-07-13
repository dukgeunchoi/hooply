import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests write real rows and clean up after themselves —
    // point them at a dedicated database so they never touch local dev data
    // ingested via `pnpm --filter @hooply/worker dev`.
    env: {
      DATABASE_URL: "postgres://hooply:hooply@localhost:5432/hooply_test",
      // DB index 1, not the default 0 — same reasoning as DATABASE_URL above:
      // tests write real live:game:* keys and must never touch local dev
      // Redis data ingested via `pnpm --filter @hooply/worker dev`.
      REDIS_URL: "redis://localhost:6379/1",
    },
    // Test files share one real Postgres database (no per-file schema/tx
    // isolation), so two files seeding the same provider_ref can collide if
    // vitest runs them in parallel workers. Run files sequentially instead.
    fileParallelism: false,
  },
});
