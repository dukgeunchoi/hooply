import { makeEnvelope } from "@hooply/shared";
import express, { type Express } from "express";
import { createLeaguesRouter } from "./routes/leagues";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json(makeEnvelope({ status: "ok" }));
  });

  app.use("/v1/leagues", createLeaguesRouter());

  return app;
}
