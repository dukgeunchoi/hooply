import { EventEmitter } from "node:events";
import type { NormalizedGameStatus } from "./normalize/game";

// In-process signals for the notification slice (#22) to consume — see
// docs/data-model.md's "Change events" section. A queue/LISTEN-NOTIFY
// upgrade is Path-to-Scale; MVP just needs one process to both detect and
// react to these.
export type ChangeEventType = "game_started" | "game_finished" | "game_postponed";

export type ChangeEvent = {
  type: ChangeEventType;
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  status: NormalizedGameStatus;
};

export const changeEvents = new EventEmitter();

export function emitChangeEvent(event: ChangeEvent): void {
  changeEvents.emit(event.type, event);
}

// A resume out of `suspended` back into `live` is deliberately not a second
// `game_started` — the game already started once; re-firing would send a
// misleading "game started" notification for a game that's mid-way through.
export function detectChangeEvent(
  previousStatus: NormalizedGameStatus | null,
  status: NormalizedGameStatus,
): ChangeEventType | null {
  if (previousStatus === status) return null;

  if (status === "live" && previousStatus !== "suspended") return "game_started";
  if (status === "final") return "game_finished";
  if (status === "postponed") return "game_postponed";
  return null;
}
