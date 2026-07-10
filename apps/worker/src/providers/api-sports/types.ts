// Raw API-Sports (api-basketball) response shapes. Nothing outside this
// provider directory should ever see these — normalize.ts translates them
// into the canonical schema.

export type ApiSportsSeason = {
  season: number | string;
  start: string;
  end: string;
};

export type ApiSportsLeague = {
  id: number;
  name: string;
  logo: string | null;
  country: { name: string | null } | null;
  seasons: ApiSportsSeason[];
};
