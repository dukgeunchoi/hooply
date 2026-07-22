import type { TeamStandingSummary } from "@hooply/shared";

function ordinal(n: number): string {
  const remainder = n % 100;
  if (remainder >= 11 && remainder <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// Team Page header's "3rd West · 42–18" (docs/screens.md).
export function standingLabel(standing: TeamStandingSummary): string {
  const groupLabel = standing.conference ?? standing.group_name;
  const rank = groupLabel ? `${ordinal(standing.rank)} ${groupLabel}` : ordinal(standing.rank);
  return `${rank} · ${standing.wins}–${standing.losses}`;
}
