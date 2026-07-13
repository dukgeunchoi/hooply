import { describe, expect, it } from "vitest";
import { detectChangeEvent } from "./events";

describe("detectChangeEvent", () => {
  it("fires game_started on scheduled -> live", () => {
    expect(detectChangeEvent("scheduled", "live")).toBe("game_started");
  });

  it("fires game_started when a game is first observed already live", () => {
    expect(detectChangeEvent(null, "live")).toBe("game_started");
  });

  it("does not re-fire game_started when a suspended game resumes", () => {
    expect(detectChangeEvent("suspended", "live")).toBeNull();
  });

  it("fires game_finished on live -> final", () => {
    expect(detectChangeEvent("live", "final")).toBe("game_finished");
  });

  it("fires game_postponed on scheduled -> postponed", () => {
    expect(detectChangeEvent("scheduled", "postponed")).toBe("game_postponed");
  });

  it("returns null when the status hasn't changed", () => {
    expect(detectChangeEvent("live", "live")).toBeNull();
  });

  it("returns null for transitions with no corresponding event (e.g. live -> suspended)", () => {
    expect(detectChangeEvent("live", "suspended")).toBeNull();
  });
});
