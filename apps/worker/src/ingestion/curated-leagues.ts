// The MVP launch set (see docs/provider-decision.md and issue #13). Each
// entry's provider ref is the API-Sports (api-basketball) league id.
// quarter/OT duration aren't in the provider response — they're known
// constants per competition ruleset.

export type CuratedLeagueConfig = {
  providerRef: string;
  priority: number;
  quarterDurationMins: number;
  otDurationMins: number;
};

export const CURATED_LEAGUES: readonly CuratedLeagueConfig[] = [
  { providerRef: "12", priority: 0, quarterDurationMins: 12, otDurationMins: 5 }, // NBA
  { providerRef: "120", priority: 1, quarterDurationMins: 10, otDurationMins: 5 }, // Euroleague
  { providerRef: "117", priority: 2, quarterDurationMins: 10, otDurationMins: 5 }, // ACB
];
