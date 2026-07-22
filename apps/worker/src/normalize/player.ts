import type { ApiSportsPlayer } from "../providers/api-sports/types";

export type NormalizedPlayer = {
  provider: "api-sports";
  providerRef: string;
  fullName: string;
  position: string | null;
  jerseyNumber: number | null;
  country: string | null;
};

export function normalizePlayer(raw: ApiSportsPlayer): NormalizedPlayer {
  return {
    provider: "api-sports",
    providerRef: String(raw.id),
    fullName: raw.name,
    position: raw.position,
    jerseyNumber: raw.number === null ? null : Number(raw.number),
    country: raw.country,
  };
}

// A pre-existing canonical player (canonical_id IS NULL) this incoming
// roster row might be a duplicate alias of.
export type CanonicalCandidate = {
  id: string;
  fullName: string;
  country: string | null;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// ADR-0003: providers occasionally re-issue a brand-new provider_ref for the
// same real person (a mid-season transfer is the common case). A new
// provider_ref whose name matches an existing canonical player — and whose
// country doesn't actively conflict — is treated as a duplicate alias rather
// than a new human: the existing row (which may already carry game-stat
// history) stays canonical, and the caller points the new row's canonical_id
// at it. Matching tolerates a missing country on either side (a fresh
// roster row sometimes lacks it) but rejects a genuine conflict, since two
// different real people can share a common name.
export function detectCanonicalDuplicate(
  incoming: Pick<NormalizedPlayer, "fullName" | "country">,
  candidates: readonly CanonicalCandidate[],
): string | null {
  const incomingName = normalizeName(incoming.fullName);
  const match = candidates.find(
    (c) =>
      normalizeName(c.fullName) === incomingName &&
      (incoming.country === null || c.country === null || c.country === incoming.country),
  );
  return match?.id ?? null;
}
