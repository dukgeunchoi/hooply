import type { CuratedLeagueConfig } from "../ingestion/curated-leagues";
import type { ApiSportsLeague, ApiSportsSeason } from "../providers/api-sports/types";

export type NormalizedLeague = {
  provider: "api-sports";
  providerRef: string;
  name: string;
  country: string | null;
  logoUrl: string | null;
  priority: number;
  isActive: boolean;
  quarterDurationMins: number;
  otDurationMins: number;
};

export type NormalizedSeason = {
  providerRef: string;
  label: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

export function normalizeLeague(
  raw: ApiSportsLeague,
  config: CuratedLeagueConfig,
): NormalizedLeague {
  return {
    provider: "api-sports",
    providerRef: String(raw.id),
    name: raw.name,
    country: raw.country?.name ?? null,
    logoUrl: raw.logo,
    priority: config.priority,
    isActive: true,
    quarterDurationMins: config.quarterDurationMins,
    otDurationMins: config.otDurationMins,
  };
}

export function normalizeSeason(raw: ApiSportsSeason, isCurrent: boolean): NormalizedSeason {
  const label = String(raw.season);
  return {
    providerRef: label,
    label,
    startsOn: raw.start,
    endsOn: raw.end,
    isCurrent,
  };
}

export function pickSeasonsToSeed(
  seasons: readonly ApiSportsSeason[],
  referenceDate: Date,
): { current: ApiSportsSeason; previous: ApiSportsSeason | null } {
  const sorted = [...seasons].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const firstSeason = sorted[0];
  if (!firstSeason) {
    throw new Error("pickSeasonsToSeed: no seasons provided");
  }

  const startedIndex = sorted.reduce(
    (lastIndex, s, i) => (new Date(s.start).getTime() <= referenceDate.getTime() ? i : lastIndex),
    -1,
  );

  const currentIndex = startedIndex === -1 ? 0 : startedIndex;
  const current = sorted[currentIndex] ?? firstSeason;
  const previous = currentIndex > 0 ? (sorted[currentIndex - 1] ?? null) : null;

  return { current, previous };
}
