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

export type ApiSportsStandingGroup = {
  // Null for leagues with no conference/group split (e.g. Euroleague, ACB).
  // When present, API-Sports emits one row per team per grouping axis it
  // knows about — for NBA that means both a conference-named group
  // ("Eastern Conference") and a division-named group ("Atlantic") per
  // team, with nothing but this string distinguishing them.
  name: string | null;
};

export type ApiSportsStandingGames = {
  played: number;
  win: { total: number; percentage: string };
  lose: { total: number; percentage: string };
};

export type ApiSportsStandingPoints = {
  for: number;
  against: number;
};

export type ApiSportsStanding = {
  position: number;
  group: ApiSportsStandingGroup;
  team: ApiSportsGameTeam;
  games: ApiSportsStandingGames;
  points: ApiSportsStandingPoints;
  form: string | null;
};

// GET /games/statistics/players?id={gameId} — flat array, one row per
// player (not grouped by team server-side; team.id ties each row back to
// the game's home/away team). Per docs/provider-decision.md's spike
// finding, player-level rows don't reliably carry steals/turnovers/blocks
// (team-level does) even though the field exists on the schema, so these
// are nullable here rather than assumed present.
export type ApiSportsBoxScorePlayerStat = {
  team: { id: number };
  player: { id: number; name: string };
  type: "starters" | "bench";
  min: string | null;
  points: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  tpm: number;
  tpa: number;
  offReb: number;
  defReb: number;
  totReb: number;
  assists: number;
  pFouls: number;
  steals: number | null;
  turnovers: number | null;
  blocks: number | null;
  plusMinus: string | null;
};

// GET /games/statistics/teams?id={gameId} — one row per team, full
// counting stats (unlike the player endpoint, this one does include
// steals/turnovers/blocks per the spike).
export type ApiSportsBoxScoreTeamStat = {
  team: { id: number };
  points: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  tpm: number;
  tpa: number;
  offReb: number;
  defReb: number;
  totReb: number;
  assists: number;
  pFouls: number;
  steals: number;
  turnovers: number;
  blocks: number;
};
