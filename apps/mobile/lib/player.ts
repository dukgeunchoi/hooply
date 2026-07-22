export function formatAvg(n: number): string {
  return n.toFixed(1);
}

// season_averages' shooting splits are already computed ratios (or null when
// there were no attempts) — a different shape from lib/boxscore.ts's
// formatPct, which takes a raw made/att pair from a single box score line.
export function formatRatioPct(ratio: number | null): string {
  return ratio === null ? "–" : `${Math.round(ratio * 100)}%`;
}

export function formatPhysicals(heightCm: number | null, weightKg: number | null): string | null {
  if (heightCm === null && weightKg === null) return null;
  const parts: string[] = [];
  if (heightCm !== null) parts.push(`${heightCm} cm`);
  if (weightKg !== null) parts.push(`${weightKg} kg`);
  return parts.join(" / ");
}
