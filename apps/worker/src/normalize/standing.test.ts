import { describe, expect, it } from "vitest";
import type { ApiSportsStanding } from "../providers/api-sports/types";
import { normalizeStandings } from "./standing";

function makeRow(overrides: Partial<ApiSportsStanding> = {}): ApiSportsStanding {
  return {
    position: 1,
    group: { name: null },
    team: { id: 152, name: "Oklahoma City Thunder", logo: "https://media/152.png" },
    games: {
      played: 82,
      win: { total: 57, percentage: "0.695" },
      lose: { total: 25, percentage: "0.305" },
    },
    points: { for: 9847, against: 9239 },
    form: "WWLWL",
    ...overrides,
  };
}

describe("normalizeStandings", () => {
  it("maps a flat (ungrouped) league's rows onto the canonical shape", () => {
    const rows = [
      makeRow(),
      makeRow({ position: 2, team: { id: 139, name: "Denver Nuggets", logo: null } }),
    ];
    const normalized = normalizeStandings(rows);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual({
      team: {
        provider: "api-sports",
        providerRef: "152",
        name: "Oklahoma City Thunder",
        logoUrl: "https://media/152.png",
      },
      rank: 1,
      played: 82,
      wins: 57,
      losses: 25,
      winPct: "0.695",
      pointsFor: 9847,
      pointsAgainst: 9239,
      streak: "WWLWL",
      gamesBehind: null,
      conference: null,
      groupName: null,
    });
  });

  it("maps a missing form field to a null streak", () => {
    const normalized = normalizeStandings([makeRow({ form: null })]);
    expect(normalized[0]?.streak).toBeNull();
  });

  it('classifies "Eastern Conference"/"Western Conference" groups into conference "East"/"West"', () => {
    const rows = [
      makeRow({ group: { name: "Eastern Conference" } }),
      makeRow({ group: { name: "Western Conference" }, position: 1 }),
    ];
    const normalized = normalizeStandings(rows);
    expect(normalized.map((r) => r.conference)).toEqual(["East", "West"]);
    expect(normalized.every((r) => r.groupName === null)).toBe(true);
  });

  it("drops division-named duplicate rows when a conference split is present (the NBA case)", () => {
    // API-Sports emits both a conference row and a division row per team
    // with nothing but group.name distinguishing them (see docs comment in
    // providers/api-sports/types.ts) — the same team/position/stats appear
    // twice. Only the conference-named rows should survive normalization.
    const thunderConference = makeRow({ group: { name: "Western Conference" } });
    const thunderDivision = makeRow({ group: { name: "Northwest" } });
    const nuggetsConference = makeRow({
      group: { name: "Western Conference" },
      position: 2,
      team: { id: 139, name: "Denver Nuggets", logo: null },
    });
    const nuggetsDivision = makeRow({
      group: { name: "Northwest" },
      position: 2,
      team: { id: 139, name: "Denver Nuggets", logo: null },
    });

    const normalized = normalizeStandings([
      thunderConference,
      thunderDivision,
      nuggetsConference,
      nuggetsDivision,
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized.every((r) => r.conference === "West")).toBe(true);
    expect(normalized.map((r) => r.team.providerRef)).toEqual(["152", "139"]);
  });

  it('treats a non-conference, non-null group name as a group-stage label ("Group A")', () => {
    const normalized = normalizeStandings([makeRow({ group: { name: "Group A" } })]);
    expect(normalized[0]).toMatchObject({ conference: null, groupName: "Group A" });
  });

  it("returns an empty array for an empty input", () => {
    expect(normalizeStandings([])).toEqual([]);
  });
});
