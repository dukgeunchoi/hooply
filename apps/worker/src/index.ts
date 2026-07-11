import { existsSync } from "node:fs";
import cron from "node-cron";
import { ingestGames } from "./ingestion/games";
import { ingestLeagues } from "./ingestion/leagues";
import { ingestStandings } from "./ingestion/standings";

const envPath = new URL("../.env", import.meta.url);
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const envApiKey = process.env.API_SPORTS_API_KEY;
if (!envApiKey) {
  throw new Error("Missing API_SPORTS_API_KEY");
}
const apiKey: string = envApiKey;

await ingestLeagues(apiKey);
console.log("hooply worker: league ingestion complete");

// Games ingestion covers today + tomorrow on every tick: today because it's
// the live-relevant date (see docs/provider-decision.md's request budget —
// this stays well within the paid-tier daily allowance), tomorrow so the
// Scores screen's date strip has next-day schedules ready before the day
// rolls over. Yesterday and earlier stay populated from when they were
// "today" on a prior tick, given the worker runs continuously in deploy.
// Live in-game polling at a faster cadence is issue #16; this loop is the
// "slower cadence for non-live windows" cadence from issue #14.
function datesToIngest(reference = new Date()): string[] {
  const today = reference.toISOString().slice(0, 10);
  const tomorrow = new Date(reference.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [today, tomorrow];
}

async function runGamesIngestion(): Promise<void> {
  for (const date of datesToIngest()) {
    await ingestGames(apiKey, date);
  }
  console.log("hooply worker: games ingestion complete");
}

await runGamesIngestion();
cron.schedule("*/5 * * * *", () => {
  runGamesIngestion().catch((err) => {
    console.error("hooply worker: games ingestion failed", err);
  });
});

// Standings don't change mid-game (issue #15) — a few-times-a-day cadence
// is plenty and keeps this well inside the request budget in
// docs/provider-decision.md. Runs once at startup too, so a fresh deploy
// doesn't wait up to 6h for its first standings.
async function runStandingsIngestion(): Promise<void> {
  await ingestStandings(apiKey);
  console.log("hooply worker: standings ingestion complete");
}

await runStandingsIngestion();
cron.schedule("0 */6 * * *", () => {
  runStandingsIngestion().catch((err) => {
    console.error("hooply worker: standings ingestion failed", err);
  });
});

// Live game polling at 10-15s cadence (node-cron) lands in a later
// ingestion phase (#16). Stay alive so a one-shot exit isn't mistaken for a
// crash on deploy.
await new Promise(() => {});
