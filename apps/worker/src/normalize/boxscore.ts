import type {
  ApiSportsBoxScorePlayerStat,
  ApiSportsBoxScoreTeamStat,
} from "../providers/api-sports/types";

export type NormalizedPlayerStat = {
  provider: "api-sports";
  playerProviderRef: string;
  playerName: string;
  teamProviderRef: string;
  isStarter: boolean;
  secondsPlayed: number;
  points: number;
  assists: number;
  reboundsOff: number;
  reboundsDef: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgMade: number;
  fgAtt: number;
  threeMade: number;
  threeAtt: number;
  ftMade: number;
  ftAtt: number;
  plusMinus: number | null;
};

export type NormalizedTeamStat = {
  provider: "api-sports";
  teamProviderRef: string;
  points: number;
  assists: number;
  reboundsOff: number;
  reboundsDef: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgMade: number;
  fgAtt: number;
  threeMade: number;
  threeAtt: number;
  ftMade: number;
  ftAtt: number;
};

export type NormalizedPlayerStub = {
  provider: "api-sports";
  providerRef: string;
  fullName: string;
};

// "MM:SS" (also seen as whole-minute "MM:00") -> total seconds. `null` covers
// a DNP player (no `min` field at all).
function parseSecondsPlayed(min: string | null): number {
  if (!min) return 0;
  const [minutesPart, secondsPart] = min.split(":");
  const minutes = Number(minutesPart ?? 0);
  const seconds = Number(secondsPart ?? 0);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return 0;
  return minutes * 60 + seconds;
}

function parsePlusMinus(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function normalizePlayerStat(raw: ApiSportsBoxScorePlayerStat): NormalizedPlayerStat {
  return {
    provider: "api-sports",
    playerProviderRef: String(raw.player.id),
    playerName: raw.player.name,
    teamProviderRef: String(raw.team.id),
    isStarter: raw.type === "starters",
    secondsPlayed: parseSecondsPlayed(raw.min),
    points: raw.points,
    assists: raw.assists,
    reboundsOff: raw.offReb,
    reboundsDef: raw.defReb,
    // Per docs/provider-decision.md's spike finding, player-level lines from
    // this provider don't reliably include steals/blocks/turnovers (only
    // team-level does) — default to 0 rather than store a misleading value.
    steals: raw.steals ?? 0,
    blocks: raw.blocks ?? 0,
    turnovers: raw.turnovers ?? 0,
    fouls: raw.pFouls,
    fgMade: raw.fgm,
    fgAtt: raw.fga,
    threeMade: raw.tpm,
    threeAtt: raw.tpa,
    ftMade: raw.ftm,
    ftAtt: raw.fta,
    plusMinus: parsePlusMinus(raw.plusMinus),
  };
}

export function normalizeTeamStat(raw: ApiSportsBoxScoreTeamStat): NormalizedTeamStat {
  return {
    provider: "api-sports",
    teamProviderRef: String(raw.team.id),
    points: raw.points,
    assists: raw.assists,
    reboundsOff: raw.offReb,
    reboundsDef: raw.defReb,
    steals: raw.steals,
    blocks: raw.blocks,
    turnovers: raw.turnovers,
    fouls: raw.pFouls,
    fgMade: raw.fgm,
    fgAtt: raw.fga,
    threeMade: raw.tpm,
    threeAtt: raw.tpa,
    ftMade: raw.ftm,
    ftAtt: raw.fta,
  };
}

// Box score ingestion runs before any dedicated player-ingestion phase
// exists (same gap games ingestion has for teams, see normalize/game.ts) —
// this seeds just enough of a player row to satisfy player_game_stat.player_id.
export function normalizePlayerStub(stat: NormalizedPlayerStat): NormalizedPlayerStub {
  return {
    provider: stat.provider,
    providerRef: stat.playerProviderRef,
    fullName: stat.playerName,
  };
}
