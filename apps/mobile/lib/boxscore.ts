import type { PlayerBoxScore } from "@hooply/shared";

// Store seconds, render minutes (docs/data-model.md) — box scores
// conventionally show whole minutes, not MM:SS.
export function formatMinutes(secondsPlayed: number): string {
  return String(Math.floor(secondsPlayed / 60));
}

export function formatPlusMinus(value: number | null): string {
  if (value === null) return "–";
  return value > 0 ? `+${value}` : String(value);
}

export function formatPct(made: number, att: number): string {
  if (att === 0) return "–";
  return `${Math.round((made / att) * 100)}%`;
}

// Top 3 by points per team (docs/screens.md's Summary tab requirement).
export function topPerformers(players: PlayerBoxScore[], limit = 3): PlayerBoxScore[] {
  return [...players].sort((a, b) => b.stats.points - a.stats.points).slice(0, limit);
}
