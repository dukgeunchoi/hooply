// Spike: does API-Sports (api-basketball) answer the three provider-decision questions?
// Run with: npx tsx apps/worker/spikes/api-sports.ts
// See docs/provider-decision.md for what this feeds into.

import { getJson, loadEnv, report, requireEnv, section, sleep } from "./_shared.ts";

loadEnv();

const BASE = "https://v1.basketball.api-sports.io";
const KEY = requireEnv("API_SPORTS_API_KEY");
const headers = { "x-apisports-key": KEY };

const LEAGUES = { euroleague: 120, acb: 117, nba: 12 };

type ApiSportsGame = {
  id: number;
  status: { short: string; timer: string | null };
  league: { id: number; name: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  scores: {
    home: { quarter_1: number | null; total: number };
    away: { quarter_1: number | null; total: number };
  };
};

async function finishedGame(leagueId: number, season: string | number) {
  const { response } = await getJson<{ response: ApiSportsGame[] }>(
    `${BASE}/games?league=${leagueId}&season=${season}`,
    headers,
  );
  return response.find((g) => g.status.short === "FT");
}

type ApiSportsPlayerStat = {
  team: { id: number };
  player: { id: number; name: string };
  minutes: string;
  points: number;
};

type ApiSportsPlayerRef = { id: number; name: string };

async function boxScoreQuestion(label: string, leagueId: number, season: string | number) {
  section(`Q1 non-NBA box scores — ${label}`);
  const game = await finishedGame(leagueId, season);
  if (!game) {
    report("finished game found", false);
    return;
  }
  report("game", `${game.teams.home.name} vs ${game.teams.away.name} (id ${game.id})`);
  report("quarter scores present", Boolean(game.scores.home.quarter_1 !== null));
  report("scores", game.scores);
  report("clock field on game object", game.status.timer);
  report(
    "clock note",
    "null here because the game is finished — field itself confirmed live in Q2 poll below",
  );

  const players = await getJson<{ results: number; response: ApiSportsPlayerStat[] }>(
    `${BASE}/games/statistics/players?id=${game.id}`,
    headers,
  );
  report("player rows returned", players.results);
  report("sample player line", players.response[0] ?? null);
}

async function liveLatencyQuestion() {
  section("Q2 live update latency");
  const today = new Date().toISOString().slice(0, 10);
  const { response } = await getJson<{ response: ApiSportsGame[] }>(
    `${BASE}/games?date=${today}`,
    headers,
  );
  const liveStatuses = new Set(["Q1", "Q2", "Q3", "Q4", "OT", "BT", "HT"]);
  const nba = response.find((g) => g.league.id === LEAGUES.nba && liveStatuses.has(g.status.short));
  const game = nba ?? response.find((g) => liveStatuses.has(g.status.short));

  if (!game) {
    report("live game found", false);
    report("note", "no live game on any league at spike run time — rerun during live hours");
    return;
  }
  if (!nba) {
    report("note", "NBA has no live games right now (off-season) — using a proxy league instead");
  }
  report(
    "game",
    `${game.league.name}: ${game.teams.home.name} vs ${game.teams.away.name} (id ${game.id})`,
  );

  const polls: { at: string; status: string; timer: string | null; total: number | null }[] = [];
  for (let i = 0; i < 4; i++) {
    const { response: gameResp } = await getJson<{ response: ApiSportsGame[] }>(
      `${BASE}/games?id=${game.id}`,
      headers,
    );
    const g = gameResp[0];
    if (g) {
      polls.push({
        at: new Date().toISOString(),
        status: g.status.short,
        timer: g.status.timer,
        total: g.scores.home.total,
      });
    }
    if (i < 3) await sleep(15_000);
  }
  report("polls (15s apart)", polls);
}

async function providerRefStabilityQuestion() {
  section("Q3 provider_ref stability");
  const game2024 = await finishedGame(LEAGUES.euroleague, 2024);
  if (!game2024) {
    report("finished 2024 EuroLeague game found", false);
    return;
  }
  const teamId = game2024.teams.home.id;
  const teamName = game2024.teams.home.name;

  const { response: teams2023 } = await getJson<{ response: ApiSportsGame[] }>(
    `${BASE}/games?league=${LEAGUES.euroleague}&season=2023&team=${teamId}`,
    headers,
  );
  report("team", `${teamName} (id ${teamId})`);
  report("team id appears in 2023 season games", teams2023.length > 0);

  const playersResp = await getJson<{ response: ApiSportsPlayerStat[] }>(
    `${BASE}/games/statistics/players?id=${game2024.id}`,
    headers,
  );
  const player = playersResp.response[0];
  if (!player) {
    report("player stat line found", false);
    return;
  }
  const { response: playerIn2024 } = await getJson<{ response: ApiSportsPlayerRef[] }>(
    `${BASE}/players?id=${player.player.id}&season=2024&team=${teamId}`,
    headers,
  );
  const { response: playerIn2023 } = await getJson<{ response: ApiSportsPlayerRef[] }>(
    `${BASE}/players?id=${player.player.id}&season=2023&team=${teamId}`,
    headers,
  );
  report("player", `${player.player.name} (id ${player.player.id})`);
  report("player id resolves in season 2024", playerIn2024.length > 0);
  report("player id resolves in season 2023", playerIn2023.length > 0);
}

async function main() {
  await boxScoreQuestion("Euroleague", LEAGUES.euroleague, 2024);
  await boxScoreQuestion("ACB", LEAGUES.acb, "2024-2025");
  await liveLatencyQuestion();
  await providerRefStabilityQuestion();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
