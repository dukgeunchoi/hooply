import { describe, expect, it } from "vitest";
import type { ApiSportsPlayer } from "../providers/api-sports/types";
import { detectCanonicalDuplicate, normalizePlayer } from "./player";

function makeRaw(overrides: Partial<ApiSportsPlayer> = {}): ApiSportsPlayer {
  return {
    id: 818,
    name: "Alexander-Walker Nickeil",
    number: "9",
    country: "Canada",
    position: "Guard",
    age: 25,
    ...overrides,
  };
}

describe("normalizePlayer", () => {
  it("maps a fully-populated roster row onto the canonical shape", () => {
    expect(normalizePlayer(makeRaw())).toEqual({
      provider: "api-sports",
      providerRef: "818",
      fullName: "Alexander-Walker Nickeil",
      position: "Guard",
      jerseyNumber: 9,
      country: "Canada",
    });
  });

  it("maps a two-way/no-roster-info row's null fields straight through", () => {
    const normalized = normalizePlayer(
      makeRaw({ id: 27708, name: "J. Jackson", number: null, country: null, position: null }),
    );
    expect(normalized.jerseyNumber).toBeNull();
    expect(normalized.country).toBeNull();
    expect(normalized.position).toBeNull();
  });

  it("coerces the string jersey number to an int", () => {
    const normalized = normalizePlayer(makeRaw({ number: "27" }));
    expect(normalized.jerseyNumber).toBe(27);
  });
});

describe("detectCanonicalDuplicate", () => {
  const existingPlayer = {
    id: "player-1",
    fullName: "Gillespie Collin",
    country: "USA",
  };

  it("matches an incoming player against a canonical candidate with the same name and country", () => {
    const result = detectCanonicalDuplicate({ fullName: "Gillespie Collin", country: "USA" }, [
      existingPlayer,
    ]);
    expect(result).toBe("player-1");
  });

  it("matches case- and whitespace-insensitively", () => {
    const result = detectCanonicalDuplicate({ fullName: "  gillespie collin  ", country: "USA" }, [
      existingPlayer,
    ]);
    expect(result).toBe("player-1");
  });

  it("still matches when one side is missing a country (roster row with no country yet)", () => {
    const result = detectCanonicalDuplicate({ fullName: "Gillespie Collin", country: null }, [
      existingPlayer,
    ]);
    expect(result).toBe("player-1");
  });

  it("does not match when the country conflicts (same name, different real person)", () => {
    const result = detectCanonicalDuplicate({ fullName: "Gillespie Collin", country: "France" }, [
      existingPlayer,
    ]);
    expect(result).toBeNull();
  });

  it("returns null when no candidate shares the name", () => {
    const result = detectCanonicalDuplicate({ fullName: "Someone Else", country: "USA" }, [
      existingPlayer,
    ]);
    expect(result).toBeNull();
  });

  it("returns null against an empty candidate list", () => {
    expect(
      detectCanonicalDuplicate({ fullName: "Gillespie Collin", country: "USA" }, []),
    ).toBeNull();
  });
});
