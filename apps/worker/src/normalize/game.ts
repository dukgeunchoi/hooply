import type { ApiSportsGame, ApiSportsGameScoreLine } from "../providers/api-sports/types";

export type NormalizedGameStatus =
  | "scheduled"
  | "live"
  | "final"
  | "suspended"
  | "postponed"
  | "cancelled";

export type NormalizedGame = {
  provider: "api-sports";
  providerRef: string;
  homeTeamProviderRef: string;
  awayTeamProviderRef: string;
  tipoffAt: string;
  status: NormalizedGameStatus;
  period: number | null;
  clock: string | null;
  homeScore: number;
  awayScore: number;
  periodScores: { home: number[]; away: number[] } | null;
  venue: string | null;
};

// Status-code groups per API-Sports (API-Basketball). NS, Q1-Q4, FT, and POST
// were confirmed against the live free-tier feed while implementing #14; the
// rest (OT, BT/HT, SUSP, AOT, CANC, ABD, AWD) follow that provider's
// documented convention but weren't observed live — revisit this table if a
// real payload ever disagrees with it.
const SCHEDULED_CODES = new Set(["NS"]);
const BREAK_CODES = new Set(["BT", "HT"]);
const FINAL_CODES = new Set(["FT", "AOT"]);
const SUSPENDED_CODES = new Set(["SUSP"]);
const POSTPONED_CODES = new Set(["POST"]);
const CANCELLED_CODES = new Set(["CANC", "ABD", "AWD"]);

const QUARTER_CODE = /^Q(\d+)$/;
const OVERTIME_CODE = /^(\d*)OT$/;

// ADR-0002: during an inter-quarter break there is no "current" quarter, so
// the number of quarters that already carry a score equals the quarter just
// completed. This only holds while no quarter is actively being played
// (mid-quarter scores also populate quarter_N, which is why this can't be
// reused for the Q1-Q4 codes below).
function countCompletedQuarters(line: ApiSportsGameScoreLine): number {
  return [line.quarter_1, line.quarter_2, line.quarter_3, line.quarter_4].filter((q) => q !== null)
    .length;
}

function toPeriodScores(line: ApiSportsGameScoreLine): number[] {
  const quarters = [line.quarter_1, line.quarter_2, line.quarter_3, line.quarter_4].filter(
    (q): q is number => q !== null,
  );
  if (line.over_time !== null) {
    quarters.push(line.over_time);
  }
  return quarters;
}

// The provider reports only whole minutes on `status.timer`, no seconds — the
// canonical "MM:SS" clock is padded with ":00" as a documented approximation.
// Fine-grained live clock accuracy is out of scope until live polling (#16).
function formatClock(timer: string | null): string {
  if (!timer) return "00:00";
  return `${timer.padStart(2, "0")}:00`;
}

export function normalizeGame(raw: ApiSportsGame): NormalizedGame {
  const short = raw.status.short;
  const home = raw.scores.home;
  const away = raw.scores.away;

  let status: NormalizedGameStatus;
  let period: number | null = null;
  let clock: string | null = null;

  const quarterMatch = short.match(QUARTER_CODE);
  const overtimeMatch = short.match(OVERTIME_CODE);

  if (SCHEDULED_CODES.has(short)) {
    status = "scheduled";
  } else if (quarterMatch) {
    status = "live";
    period = Number(quarterMatch[1]);
    clock = formatClock(raw.status.timer);
  } else if (overtimeMatch) {
    status = "live";
    period = 4 + (overtimeMatch[1] ? Number(overtimeMatch[1]) : 1);
    clock = formatClock(raw.status.timer);
  } else if (BREAK_CODES.has(short)) {
    status = "live";
    period = countCompletedQuarters(home);
    clock = "00:00";
  } else if (FINAL_CODES.has(short)) {
    status = "final";
  } else if (SUSPENDED_CODES.has(short)) {
    status = "suspended";
  } else if (POSTPONED_CODES.has(short)) {
    status = "postponed";
  } else if (CANCELLED_CODES.has(short)) {
    status = "cancelled";
  } else {
    throw new Error(`normalizeGame: unrecognized status code "${short}"`);
  }

  const homePeriods = toPeriodScores(home);
  const awayPeriods = toPeriodScores(away);
  const periodScores =
    homePeriods.length > 0 || awayPeriods.length > 0
      ? { home: homePeriods, away: awayPeriods }
      : null;

  return {
    provider: "api-sports",
    providerRef: String(raw.id),
    homeTeamProviderRef: String(raw.teams.home.id),
    awayTeamProviderRef: String(raw.teams.away.id),
    tipoffAt: raw.date,
    status,
    period,
    clock,
    homeScore: home.total ?? 0,
    awayScore: away.total ?? 0,
    periodScores,
    venue: raw.venue,
  };
}
