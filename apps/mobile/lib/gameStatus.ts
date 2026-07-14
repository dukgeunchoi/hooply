import type { GameStatus } from "@hooply/shared";
import { formatTipoff } from "./dates";

// Shared by GameRow (list/schedule views) and the Game Detail screen — both
// render off objects with these same top-level fields (Game and GameDetail
// from @hooply/shared), just with different siblings attached.
type StatusFields = {
  status: GameStatus;
  period: number | null;
  clock: string | null;
  tipoff_at: string;
};

type TeamRefLike = { name: string; code: string | null };

export function teamLabel(team: TeamRefLike): string {
  return team.code ?? team.name;
}

// A scheduled or postponed game has no real score yet — 0-0 would be
// misleading, so callers show the tipoff time/status instead.
export function hasScore(game: Pick<StatusFields, "status">): boolean {
  return game.status !== "scheduled" && game.status !== "postponed";
}

export function statusLabel(game: StatusFields): string {
  switch (game.status) {
    case "scheduled":
      return formatTipoff(game.tipoff_at);
    case "live":
      return game.period && game.clock ? `Q${game.period} ${game.clock}` : "Live";
    case "final":
      return "Final";
    case "suspended":
      return "Suspended";
    case "postponed":
      return "Postponed";
    case "cancelled":
      return "Cancelled";
  }
}
