import { describe, expect, it } from "vitest";
import type { ApiSportsGame } from "../providers/api-sports/types";
import { normalizeGame } from "./game";

function makeRaw(overrides: Partial<ApiSportsGame> = {}): ApiSportsGame {
  return {
    id: 502074,
    date: "2026-07-11T00:30:00+00:00",
    venue: "Thomas & Mack Center",
    status: { long: "Not Started", short: "NS", timer: null },
    league: { id: 12 },
    teams: {
      home: { id: 146, name: "Memphis Grizzlies", logo: "https://media/146.png" },
      away: { id: 136, name: "Chicago Bulls", logo: "https://media/136.png" },
    },
    scores: {
      home: {
        quarter_1: null,
        quarter_2: null,
        quarter_3: null,
        quarter_4: null,
        over_time: null,
        total: null,
      },
      away: {
        quarter_1: null,
        quarter_2: null,
        quarter_3: null,
        quarter_4: null,
        over_time: null,
        total: null,
      },
    },
    ...overrides,
  };
}

describe("normalizeGame", () => {
  it("maps common provider fields onto the canonical shape", () => {
    const normalized = normalizeGame(makeRaw());
    expect(normalized).toMatchObject({
      provider: "api-sports",
      providerRef: "502074",
      homeTeamProviderRef: "146",
      awayTeamProviderRef: "136",
      tipoffAt: "2026-07-11T00:30:00+00:00",
      venue: "Thomas & Mack Center",
    });
  });

  describe("status normalization — all six canonical values", () => {
    it('maps "NS" (not started) to scheduled, with no period/clock/scores', () => {
      const normalized = normalizeGame(
        makeRaw({ status: { long: "Not Started", short: "NS", timer: null } }),
      );
      expect(normalized.status).toBe("scheduled");
      expect(normalized.period).toBeNull();
      expect(normalized.clock).toBeNull();
      expect(normalized.homeScore).toBe(0);
      expect(normalized.awayScore).toBe(0);
      expect(normalized.periodScores).toBeNull();
    });

    it('maps in-quarter codes ("Q1"-"Q4") to live, with period from the quarter number', () => {
      const raw = makeRaw({
        status: { long: "Quarter 3", short: "Q3", timer: "7" },
        scores: {
          home: {
            quarter_1: 28,
            quarter_2: 25,
            quarter_3: 14,
            quarter_4: null,
            over_time: null,
            total: 67,
          },
          away: {
            quarter_1: 30,
            quarter_2: 22,
            quarter_3: 10,
            quarter_4: null,
            over_time: null,
            total: 62,
          },
        },
      });
      const normalized = normalizeGame(raw);
      expect(normalized.status).toBe("live");
      expect(normalized.period).toBe(3);
      expect(normalized.homeScore).toBe(67);
      expect(normalized.awayScore).toBe(62);
    });

    it('maps break codes ("BT"/"HT") to live with the ADR-0002 break convention', () => {
      // Break before Q3: two quarters already have final scores, Q3/Q4 not started.
      const raw = makeRaw({
        status: { long: "Break Time", short: "BT", timer: null },
        scores: {
          home: {
            quarter_1: 28,
            quarter_2: 25,
            quarter_3: null,
            quarter_4: null,
            over_time: null,
            total: 53,
          },
          away: {
            quarter_1: 30,
            quarter_2: 22,
            quarter_3: null,
            quarter_4: null,
            over_time: null,
            total: 52,
          },
        },
      });
      const normalized = normalizeGame(raw);
      expect(normalized.status).toBe("live");
      // period holds the quarter just completed, not the upcoming one.
      expect(normalized.period).toBe(2);
      expect(normalized.clock).toBe("00:00");
    });

    it('maps "OT" to live with period 5, and "2OT" to period 6', () => {
      const ot = normalizeGame(makeRaw({ status: { long: "Over Time", short: "OT", timer: "3" } }));
      expect(ot.status).toBe("live");
      expect(ot.period).toBe(5);

      const secondOt = normalizeGame(
        makeRaw({ status: { long: "2nd Over Time", short: "2OT", timer: "1" } }),
      );
      expect(secondOt.period).toBe(6);
    });

    it('maps "FT" and "AOT" to final, with no live period/clock', () => {
      const raw = makeRaw({
        status: { long: "Game Finished", short: "FT", timer: null },
        scores: {
          home: {
            quarter_1: 20,
            quarter_2: 14,
            quarter_3: 26,
            quarter_4: 18,
            over_time: null,
            total: 78,
          },
          away: {
            quarter_1: 25,
            quarter_2: 15,
            quarter_3: 17,
            quarter_4: 14,
            over_time: null,
            total: 71,
          },
        },
      });
      const normalized = normalizeGame(raw);
      expect(normalized.status).toBe("final");
      expect(normalized.period).toBeNull();
      expect(normalized.clock).toBeNull();
      expect(normalized.homeScore).toBe(78);
      expect(normalized.awayScore).toBe(71);

      const aot = normalizeGame(
        makeRaw({ status: { long: "After Over Time", short: "AOT", timer: null } }),
      );
      expect(aot.status).toBe("final");
    });

    it('maps "SUSP" to suspended, keeping the completed-quarter period and partial scores', () => {
      const raw = makeRaw({
        status: { long: "Suspended", short: "SUSP", timer: null },
        scores: {
          home: {
            quarter_1: 28,
            quarter_2: 25,
            quarter_3: 10,
            quarter_4: null,
            over_time: null,
            total: 63,
          },
          away: {
            quarter_1: 30,
            quarter_2: 22,
            quarter_3: 8,
            quarter_4: null,
            over_time: null,
            total: 60,
          },
        },
      });
      const normalized = normalizeGame(raw);
      expect(normalized.status).toBe("suspended");
      expect(normalized.homeScore).toBe(63);
      expect(normalized.awayScore).toBe(60);
    });

    it('maps "POST" to postponed, with no scores', () => {
      const normalized = normalizeGame(
        makeRaw({ status: { long: "Game Postponed", short: "POST", timer: null } }),
      );
      expect(normalized.status).toBe("postponed");
      expect(normalized.period).toBeNull();
      expect(normalized.clock).toBeNull();
      expect(normalized.homeScore).toBe(0);
      expect(normalized.awayScore).toBe(0);
    });

    it('maps "CANC", "ABD", and "AWD" to cancelled', () => {
      for (const short of ["CANC", "ABD", "AWD"]) {
        const normalized = normalizeGame(makeRaw({ status: { long: short, short, timer: null } }));
        expect(normalized.status).toBe("cancelled");
        expect(normalized.period).toBeNull();
        expect(normalized.clock).toBeNull();
      }
    });

    it("throws on an unrecognized status code rather than silently mis-mapping it", () => {
      expect(() =>
        normalizeGame(makeRaw({ status: { long: "???", short: "ZZZ", timer: null } })),
      ).toThrow(/unrecognized/i);
    });
  });

  describe("period_scores", () => {
    it("is null before any quarter has been played", () => {
      expect(normalizeGame(makeRaw()).periodScores).toBeNull();
    });

    it("includes only the quarters played so far, in order", () => {
      const raw = makeRaw({
        status: { long: "Quarter 3", short: "Q3", timer: "7" },
        scores: {
          home: {
            quarter_1: 28,
            quarter_2: 25,
            quarter_3: 14,
            quarter_4: null,
            over_time: null,
            total: 67,
          },
          away: {
            quarter_1: 30,
            quarter_2: 22,
            quarter_3: 10,
            quarter_4: null,
            over_time: null,
            total: 62,
          },
        },
      });
      expect(normalizeGame(raw).periodScores).toEqual({
        home: [28, 25, 14],
        away: [30, 22, 10],
      });
    });

    it("appends the over_time bucket after all four quarters when present", () => {
      const raw = makeRaw({
        status: { long: "Game Finished", short: "FT", timer: null },
        scores: {
          home: {
            quarter_1: 20,
            quarter_2: 14,
            quarter_3: 26,
            quarter_4: 18,
            over_time: 9,
            total: 87,
          },
          away: {
            quarter_1: 25,
            quarter_2: 15,
            quarter_3: 17,
            quarter_4: 21,
            over_time: 7,
            total: 85,
          },
        },
      });
      expect(normalizeGame(raw).periodScores).toEqual({
        home: [20, 14, 26, 18, 9],
        away: [25, 15, 17, 21, 7],
      });
    });
  });
});
