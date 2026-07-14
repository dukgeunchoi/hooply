import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests write real rows and clean up after themselves —
    // point them at a dedicated database so they never touch local dev data
    // ingested via `pnpm --filter @hooply/worker dev`. Same database apps/api
    // uses for its own integration tests.
    env: {
      DATABASE_URL: "postgres://hooply:hooply@localhost:5432/hooply_test",
    },
    // Test files share one real Postgres database (no per-file schema/tx
    // isolation), so two files seeding the same provider_ref can collide if
    // vitest runs them in parallel workers. Run files sequentially instead.
    fileParallelism: false,
  },
});
