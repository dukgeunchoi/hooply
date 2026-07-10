import { existsSync } from "node:fs";
import { ingestLeagues } from "./ingestion/leagues";

const envPath = new URL("../.env", import.meta.url);
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const apiKey = process.env.API_SPORTS_API_KEY;
if (!apiKey) {
  throw new Error("Missing API_SPORTS_API_KEY");
}

await ingestLeagues(apiKey);
console.log("hooply worker: league ingestion complete");

// Live game polling (node-cron) lands in a later ingestion phase. Stay
// alive so a one-shot exit isn't mistaken for a crash on deploy.
await new Promise(() => {});
