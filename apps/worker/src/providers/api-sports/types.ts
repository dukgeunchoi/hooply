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

export type ApiSportsGameStatus = {
  long: string;
  short: string;
  timer: string | null;
};

export type ApiSportsGameTeam = {
  id: number;
  name: string;
  logo: string | null;
};

export type ApiSportsGameScoreLine = {
  quarter_1: number | null;
  quarter_2: number | null;
  quarter_3: number | null;
  quarter_4: number | null;
  over_time: number | null;
  total: number | null;
};

export type ApiSportsGame = {
  id: number;
  date: string;
  venue: string | null;
  status: ApiSportsGameStatus;
  league: { id: number };
  teams: { home: ApiSportsGameTeam; away: ApiSportsGameTeam };
  scores: { home: ApiSportsGameScoreLine; away: ApiSportsGameScoreLine };
};
