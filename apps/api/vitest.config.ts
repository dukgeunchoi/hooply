import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests write real rows and clean up after themselves —
    // point them at a dedicated database so they never touch local dev data
    // ingested via `pnpm --filter @hooply/worker dev`.
    env: {
      DATABASE_URL: "postgres://hooply:hooply@localhost:5432/hooply_test",
    },
  },
});
