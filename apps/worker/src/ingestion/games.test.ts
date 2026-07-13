import { describe, expect, it } from "vitest";
import { changeEvents } from "../events";
import type { NormalizedGame } from "../normalize/game";
import { emitChangeEventIfAny } from "./games";
import type { GameSyncResult } from "./games";

function makeResult(overrides: Partial<GameSyncResult> = {}): GameSyncResult {
  const normalized: NormalizedGame = {
    provider: "api-sports",
    providerRef: "502074",
    homeTeamProviderRef: "146",
    awayTeamProviderRef: "136",
    tipoffAt: "2026-07-11T00:30:00+00:00",
    status: "live",
    period: 2,
    clock: "05:30",
    homeScore: 40,
    awayScore: 38,
    periodScores: null,
    venue: null,
  };
  return {
    gameId: "11111111-1111-1111-1111-111111111111",
    leagueId: "22222222-2222-2222-2222-222222222222",
    homeTeamId: "33333333-3333-3333-3333-333333333333",
    awayTeamId: "44444444-4444-4444-4444-444444444444",
    previousStatus: "scheduled",
    normalized,
    ...overrides,
  };
}

describe("emitChangeEventIfAny", () => {
  it("emits on the shared changeEvents bus when a transition occurred", () => {
    const received: unknown[] = [];
    changeEvents.once("game_started", (event) => received.push(event));

    emitChangeEventIfAny(makeResult({ previousStatus: "scheduled" }));

    expect(received).toEqual([
      {
        type: "game_started",
        gameId: "11111111-1111-1111-1111-111111111111",
        homeTeamId: "33333333-3333-3333-3333-333333333333",
        awayTeamId: "44444444-4444-4444-4444-444444444444",
        homeScore: 40,
        awayScore: 38,
        status: "live",
      },
    ]);
  });

  it("emits nothing when the status didn't change", () => {
    const received: unknown[] = [];
    changeEvents.once("game_started", (event) => received.push(event));

    emitChangeEventIfAny(makeResult({ previousStatus: "live" }));

    expect(received).toEqual([]);
  });
});
