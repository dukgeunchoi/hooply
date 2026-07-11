import type { ApiSportsGame, ApiSportsLeague, ApiSportsStanding } from "./types";

const BASE_URL = "https://v1.basketball.api-sports.io";

export async function fetchLeague(providerRef: string, apiKey: string): Promise<ApiSportsLeague> {
  const res = await fetch(`${BASE_URL}/leagues?id=${providerRef}`, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`API-Sports request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { response: ApiSportsLeague[] };
  const league = body.response[0];
  if (!league) {
    throw new Error(`API-Sports: no league found for provider ref ${providerRef}`);
  }
  return league;
}

// One call returns every league's games for the date (see
// docs/provider-decision.md's request-budget math) — the ingestion job
// filters the response down to curated leagues itself.
export async function fetchGamesByDate(date: string, apiKey: string): Promise<ApiSportsGame[]> {
  const res = await fetch(`${BASE_URL}/games?date=${date}`, {
    headers: { "x-apisports-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`API-Sports request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { response: ApiSportsGame[] };
  return body.response;
}

// The response is an array of arrays (one sub-array per grouping stage the
// provider tracks); flatten it since the normalizer resolves conference vs.
// division duplication itself rather than relying on this response shape.
export async function fetchStandings(
  leagueProviderRef: string,
  seasonProviderRef: string,
  apiKey: string,
): Promise<ApiSportsStanding[]> {
  const res = await fetch(
    `${BASE_URL}/standings?league=${leagueProviderRef}&season=${seasonProviderRef}`,
    { headers: { "x-apisports-key": apiKey } },
  );
  if (!res.ok) {
    throw new Error(`API-Sports request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { response: ApiSportsStanding[][] };
  return body.response.flat();
}
