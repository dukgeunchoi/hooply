import { describe, expect, it } from "vitest";
import { liveIngestDates } from "./live-games";

describe("liveIngestDates", () => {
  it("includes yesterday so a game that tipped off before UTC midnight isn't dropped after rollover", () => {
    expect(liveIngestDates(new Date("2026-07-13T00:05:00Z"))).toEqual(["2026-07-12", "2026-07-13"]);
  });

  it("still covers just [yesterday, today] well after midnight", () => {
    expect(liveIngestDates(new Date("2026-07-13T18:30:00Z"))).toEqual(["2026-07-12", "2026-07-13"]);
  });
});
