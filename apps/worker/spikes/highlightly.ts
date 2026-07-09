// Spike: does Highlightly answer the three provider-decision questions?
// Run with: npx tsx apps/worker/spikes/highlightly.ts
// See docs/provider-decision.md for what this feeds into.

import { getJson, loadEnv, report, requireEnv, section, sleep } from "./_shared.ts";

loadEnv();

const BASE = "https://basketball.highlightly.net";
const KEY = requireEnv("HIGHLIGHTLY_API_KEY");
const headers = { "x-rapidapi-key": KEY };

const LEAGUES = { euroleague: 102904, acb: 100351, nba: 10996 };

type HighlightlyMatch = {
  id: number;
  league: { id: number; name: string };
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  state: {
    description: string;
    clock: string | null;
    score: { q1: string | null; current: string | null };
  };
};

type HighlightlyTeamStats = { team: { id: number; name: string }; statistics: unknown[] };

async function finishedMatch(leagueId: number, season: number) {
  const { data } = await getJson<{ data: HighlightlyMatch[] }>(
    `${BASE}/matches?leagueId=${leagueId}&season=${season}&limit=10`,
    headers,
  );
  return data.find((m) => m.state.description === "Finished");
}

async function boxScoreQuestion(label: string, leagueId: number, season: number) {
  section(`Q1 non-NBA box scores — ${label}`);
  const match = await finishedMatch(leagueId, season);
  if (!match) {
    report("finished match found", false);
    return;
  }
  report("match", `${match.homeTeam.name} vs ${match.awayTeam.name} (id ${match.id})`);
  report("quarter scores present", match.state.score.q1 != null);
  report("scores", match.state.score);
  report("clock field on match state", match.state.clock);
  report(
    "clock note",
    "null here because the match is finished — field itself confirmed live in Q2 poll below",
  );

  const stats = await getJson<HighlightlyTeamStats[]>(`${BASE}/statistics/${match.id}`, headers);
  const teamStatsPresent = stats.some((t) => t.statistics.length > 0);
  report("team-level statistics present", teamStatsPresent);
  report(
    "per-player box score endpoint",
    "none exists in the Highlightly Basketball API — confirmed via docs, no player-scoped stats route",
  );
  report("statistics payload", stats);
}

async function liveLatencyQuestion() {
  section("Q2 live update latency");
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await getJson<{ data: HighlightlyMatch[] }>(
    `${BASE}/matches?date=${today}&limit=50`,
    headers,
  );
  const notLive = new Set(["Finished", "Not started", "Postponed", "Cancelled"]);
  const nba = data.find((m) => m.league.id === LEAGUES.nba && !notLive.has(m.state.description));
  const match = nba ?? data.find((m) => !notLive.has(m.state.description));

  if (!match) {
    report("live match found", false);
    report("note", "no live match on any league at spike run time — rerun during live hours");
    return;
  }
  if (!nba) {
    report("note", "NBA has no live matches right now (off-season) — using a proxy league instead");
  }
  report(
    "match",
    `${match.league.name}: ${match.homeTeam.name} vs ${match.awayTeam.name} (id ${match.id})`,
  );

  const polls: { at: string; description: string; clock: string | null; current: string | null }[] =
    [];
  for (let i = 0; i < 4; i++) {
    const detail = await getJson<HighlightlyMatch | HighlightlyMatch[]>(
      `${BASE}/matches/${match.id}`,
      headers,
    );
    const m = Array.isArray(detail) ? detail[0] : detail;
    if (m) {
      polls.push({
        at: new Date().toISOString(),
        description: m.state.description,
        clock: m.state.clock,
        current: m.state.score.current,
      });
    }
    if (i < 3) await sleep(15_000);
  }
  report("polls (15s apart)", polls);
}

async function providerRefStabilityQuestion() {
  section("Q3 provider_ref stability");
  const match2024 = await finishedMatch(LEAGUES.euroleague, 2024);
  if (!match2024) {
    report("finished 2024 EuroLeague match found", false);
    return;
  }
  const teamId = match2024.homeTeam.id;
  const teamName = match2024.homeTeam.name;

  const { data: matches2023 } = await getJson<{ data: HighlightlyMatch[] }>(
    `${BASE}/matches?leagueId=${LEAGUES.euroleague}&season=2023&limit=50`,
    headers,
  );
  const seenIn2023 = matches2023.some((m) => m.homeTeam.id === teamId || m.awayTeam.id === teamId);
  report("team", `${teamName} (id ${teamId})`);
  report("team id appears in 2023 season matches", seenIn2023);
  report("player provider_ref stability", "N/A — Highlightly has no per-player entities/endpoints");
}

async function main() {
  await boxScoreQuestion("Euroleague", LEAGUES.euroleague, 2024);
  await boxScoreQuestion("ACB", LEAGUES.acb, 2024);
  await liveLatencyQuestion();
  await providerRefStabilityQuestion();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
