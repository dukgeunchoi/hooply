import { makeEnvelope } from "@hooply/shared";
import cors from "cors";
import express, { type Express } from "express";
import { createGamesRouter } from "./routes/games";
import { createLeaguesRouter } from "./routes/leagues";

export function createApp(): Express {
  const app = express();
  // Public read API, no cookies/auth beyond a device_id UUID (see
  // docs/api-spec.md) — open CORS is safe and the mobile web build needs it.
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json(makeEnvelope({ status: "ok" }));
  });

  app.use("/v1/leagues", createLeaguesRouter());
  app.use("/v1/games", createGamesRouter());

  return app;
}
