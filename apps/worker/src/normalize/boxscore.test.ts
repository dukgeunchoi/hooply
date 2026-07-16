import { describe, expect, it } from "vitest";
import type {
  ApiSportsBoxScorePlayerStat,
  ApiSportsBoxScoreTeamStat,
} from "../providers/api-sports/types";
import { normalizePlayerStat, normalizePlayerStub, normalizeTeamStat } from "./boxscore";

function makeRawPlayer(
  overrides: Partial<ApiSportsBoxScorePlayerStat> = {},
): ApiSportsBoxScorePlayerStat {
  return {
    team: { id: 146 },
    player: { id: 2547, name: "S. Curry" },
    type: "starters",
    min: "35:12",
    points: 28,
    fgm: 10,
    fga: 19,
    ftm: 4,
    fta: 4,
    tpm: 4,
    tpa: 9,
    offReb: 1,
    defReb: 4,
    totReb: 5,
    assists: 6,
    pFouls: 2,
    steals: 2,
    turnovers: 3,
    blocks: 0,
    plusMinus: "12",
    ...overrides,
  };
}

function makeRawTeam(
  overrides: Partial<ApiSportsBoxScoreTeamStat> = {},
): ApiSportsBoxScoreTeamStat {
  return {
    team: { id: 146 },
    points: 112,
    fgm: 42,
    fga: 88,
    ftm: 18,
    fta: 22,
    tpm: 10,
    tpa: 30,
    offReb: 9,
    defReb: 34,
    totReb: 43,
    assists: 24,
    pFouls: 18,
    steals: 7,
    turnovers: 12,
    blocks: 4,
    ...overrides,
  };
}

describe("normalizePlayerStat", () => {
  it("maps common provider fields onto the canonical shape", () => {
    const normalized = normalizePlayerStat(makeRawPlayer());
    expect(normalized).toMatchObject({
      provider: "api-sports",
      playerProviderRef: "2547",
      playerName: "S. Curry",
      teamProviderRef: "146",
      points: 28,
      assists: 6,
      reboundsOff: 1,
      reboundsDef: 4,
      fouls: 2,
      fgMade: 10,
      fgAtt: 19,
      threeMade: 4,
      threeAtt: 9,
      ftMade: 4,
      ftAtt: 4,
    });
  });

  describe("seconds_played", () => {
    it('parses "MM:SS" into total seconds', () => {
      expect(normalizePlayerStat(makeRawPlayer({ min: "35:12" })).secondsPlayed).toBe(35 * 60 + 12);
    });

    it('parses a whole-minute value with no seconds component ("22:00")', () => {
      expect(normalizePlayerStat(makeRawPlayer({ min: "22:00" })).secondsPlayed).toBe(22 * 60);
    });

    it("defaults to 0 when null (DNP)", () => {
      expect(normalizePlayerStat(makeRawPlayer({ min: null })).secondsPlayed).toBe(0);
    });
  });

  describe("is_starter", () => {
    it('maps type "starters" to true', () => {
      expect(normalizePlayerStat(makeRawPlayer({ type: "starters" })).isStarter).toBe(true);
    });

    it('maps type "bench" to false', () => {
      expect(normalizePlayerStat(makeRawPlayer({ type: "bench" })).isStarter).toBe(false);
    });
  });

  describe("plus_minus", () => {
    it("parses a positive string value to a number", () => {
      expect(normalizePlayerStat(makeRawPlayer({ plusMinus: "12" })).plusMinus).toBe(12);
    });

    it("parses a negative string value to a number", () => {
      expect(normalizePlayerStat(makeRawPlayer({ plusMinus: "-8" })).plusMinus).toBe(-8);
    });

    it("stays null when the provider doesn't supply it", () => {
      expect(normalizePlayerStat(makeRawPlayer({ plusMinus: null })).plusMinus).toBeNull();
    });
  });

  describe("steals/blocks/turnovers", () => {
    it("passes through numeric values when the provider does supply them", () => {
      const normalized = normalizePlayerStat(makeRawPlayer({ steals: 2, blocks: 1, turnovers: 3 }));
      expect(normalized).toMatchObject({ steals: 2, blocks: 1, turnovers: 3 });
    });

    it("defaults to 0 when the provider omits per-player steals/blocks/turnovers (null)", () => {
      const normalized = normalizePlayerStat(
        makeRawPlayer({ steals: null, blocks: null, turnovers: null }),
      );
      expect(normalized).toMatchObject({ steals: 0, blocks: 0, turnovers: 0 });
    });
  });
});

describe("normalizeTeamStat", () => {
  it("maps provider fields onto the canonical shape, steals/blocks/turnovers included", () => {
    const normalized = normalizeTeamStat(makeRawTeam());
    expect(normalized).toEqual({
      provider: "api-sports",
      teamProviderRef: "146",
      points: 112,
      assists: 24,
      reboundsOff: 9,
      reboundsDef: 34,
      steals: 7,
      blocks: 4,
      turnovers: 12,
      fouls: 18,
      fgMade: 42,
      fgAtt: 88,
      threeMade: 10,
      threeAtt: 30,
      ftMade: 18,
      ftAtt: 22,
    });
  });
});

describe("normalizePlayerStub", () => {
  it("derives a minimal player stub from a normalized stat line", () => {
    const normalized = normalizePlayerStat(makeRawPlayer());
    expect(normalizePlayerStub(normalized)).toEqual({
      provider: "api-sports",
      providerRef: "2547",
      fullName: "S. Curry",
    });
  });
});
