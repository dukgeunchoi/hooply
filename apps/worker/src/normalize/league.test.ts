import { describe, expect, it } from "vitest";
import type { CuratedLeagueConfig } from "../ingestion/curated-leagues";
import type { ApiSportsLeague } from "../providers/api-sports/types";
import { normalizeLeague, normalizeSeason, pickSeasonsToSeed } from "./league";

const nbaConfig: CuratedLeagueConfig = {
  providerRef: "12",
  priority: 0,
  quarterDurationMins: 12,
  otDurationMins: 5,
};

const euroleagueConfig: CuratedLeagueConfig = {
  providerRef: "120",
  priority: 1,
  quarterDurationMins: 10,
  otDurationMins: 5,
};

const season2023 = { season: "2023-2024", start: "2023-10-05", end: "2024-06-18" };
const season2024 = { season: "2024-2025", start: "2024-10-04", end: "2025-06-23" };
const season2025 = { season: "2025-2026", start: "2025-10-02", end: "2026-06-14" };

const nbaRaw: ApiSportsLeague = {
  id: 12,
  name: "NBA",
  logo: "https://media.api-sports.io/basketball/leagues/12.png",
  country: { name: "USA" },
  seasons: [season2023, season2024, season2025],
};

describe("normalizeLeague", () => {
  it("maps provider fields onto the canonical league shape", () => {
    expect(normalizeLeague(nbaRaw, nbaConfig)).toEqual({
      provider: "api-sports",
      providerRef: "12",
      name: "NBA",
      country: "USA",
      logoUrl: "https://media.api-sports.io/basketball/leagues/12.png",
      priority: 0,
      isActive: true,
      quarterDurationMins: 12,
      otDurationMins: 5,
    });
  });

  it("seeds quarter/OT duration from the curated config, not the provider payload", () => {
    const euroleagueRaw: ApiSportsLeague = { ...nbaRaw, id: 120, name: "Euroleague" };
    const normalized = normalizeLeague(euroleagueRaw, euroleagueConfig);
    expect(normalized.quarterDurationMins).toBe(10);
    expect(normalized.otDurationMins).toBe(5);
  });

  it("maps a missing country to null", () => {
    const raw: ApiSportsLeague = { ...nbaRaw, country: null };
    expect(normalizeLeague(raw, nbaConfig).country).toBeNull();
  });
});

describe("pickSeasonsToSeed", () => {
  it("picks the most recently started season as current and the one before it as previous", () => {
    // reference date sits in the 2025-2026 off-season, after it ended
    const result = pickSeasonsToSeed(nbaRaw.seasons, new Date("2026-07-10"));
    expect(result.current.season).toBe("2025-2026");
    expect(result.previous?.season).toBe("2024-2025");
  });

  it("picks the season in progress as current when the reference date falls inside it", () => {
    const result = pickSeasonsToSeed(nbaRaw.seasons, new Date("2024-01-15"));
    expect(result.current.season).toBe("2023-2024");
    expect(result.previous).toBeNull();
  });

  it("is insensitive to input ordering", () => {
    const shuffled = [season2025, season2023, season2024];
    const result = pickSeasonsToSeed(shuffled, new Date("2026-07-10"));
    expect(result.current.season).toBe("2025-2026");
    expect(result.previous?.season).toBe("2024-2025");
  });

  it("returns null previous when only one season exists", () => {
    const result = pickSeasonsToSeed([season2023], new Date("2026-07-10"));
    expect(result.current.season).toBe("2023-2024");
    expect(result.previous).toBeNull();
  });

  it("falls back to the earliest season when the reference date predates all seasons", () => {
    const result = pickSeasonsToSeed(nbaRaw.seasons, new Date("2020-01-01"));
    expect(result.current.season).toBe("2023-2024");
    expect(result.previous).toBeNull();
  });
});

describe("normalizeSeason", () => {
  it("maps a provider season onto the canonical season shape", () => {
    expect(normalizeSeason(season2024, true)).toEqual({
      providerRef: "2024-2025",
      label: "2024-2025",
      startsOn: "2024-10-04",
      endsOn: "2025-06-23",
      isCurrent: true,
    });
  });

  it("stringifies a numeric provider season label", () => {
    const raw = { season: 2025, start: "2025-09-30", end: "2026-05-24" };
    const normalized = normalizeSeason(raw, false);
    expect(normalized.providerRef).toBe("2025");
    expect(normalized.label).toBe("2025");
    expect(normalized.isCurrent).toBe(false);
  });
});
