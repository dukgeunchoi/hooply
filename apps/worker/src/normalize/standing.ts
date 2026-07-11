import type { ApiSportsStanding } from "../providers/api-sports/types";
import { type NormalizedTeamStub, normalizeTeamStub } from "./game";

export type NormalizedStanding = {
  team: NormalizedTeamStub;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  winPct: string;
  pointsFor: number;
  pointsAgainst: number;
  streak: string | null;
  gamesBehind: string | null;
  conference: string | null;
  groupName: string | null;
};

const CONFERENCE_SUFFIX = " Conference";

function isConferenceGroup(name: string | null): boolean {
  return name?.endsWith(CONFERENCE_SUFFIX) ?? false;
}

// "Eastern Conference" -> "East", "Western Conference" -> "West".
function toConferenceLabel(name: string): string {
  return name.slice(0, -CONFERENCE_SUFFIX.length).replace(/ern$/, "");
}

function classifyGroup(name: string | null): {
  conference: string | null;
  groupName: string | null;
} {
  if (name === null) return { conference: null, groupName: null };
  if (isConferenceGroup(name)) return { conference: toConferenceLabel(name), groupName: null };
  return { conference: null, groupName: name };
}

function normalizeStandingRow(raw: ApiSportsStanding): NormalizedStanding {
  const { conference, groupName } = classifyGroup(raw.group.name);
  return {
    team: normalizeTeamStub(raw.team),
    rank: raw.position,
    played: raw.games.played,
    wins: raw.games.win.total,
    losses: raw.games.lose.total,
    winPct: raw.games.win.percentage,
    pointsFor: raw.points.for,
    pointsAgainst: raw.points.against,
    streak: raw.form,
    // API-Sports doesn't expose a games-behind figure; per data-model.md,
    // standing is provider-supplied rather than computed, so this stays
    // null instead of being derived from wins/losses ourselves.
    gamesBehind: null,
    conference,
    groupName,
  };
}

// API-Sports returns NBA standings twice over — once ranked within
// conference (group.name "Eastern/Western Conference"), once within
// division ("Atlantic", "Pacific", etc.) — with nothing but group.name
// distinguishing them (see providers/api-sports/types.ts). The League Hub
// only wants one table, split by conference when present (docs/screens.md),
// so when conference-named groups exist we keep only those and drop the
// division rows.
export function normalizeStandings(raw: readonly ApiSportsStanding[]): NormalizedStanding[] {
  const hasConferenceSplit = raw.some((r) => isConferenceGroup(r.group.name));
  const rows = hasConferenceSplit ? raw.filter((r) => isConferenceGroup(r.group.name)) : raw;
  return rows.map(normalizeStandingRow);
}
