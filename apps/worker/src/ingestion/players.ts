import { db, player } from "@hooply/db";
import type { NormalizedPlayerStub } from "../normalize/boxscore";

// Box score ingestion runs before any dedicated player-ingestion phase
// exists (mirrors upsertTeamStub's role for teams pre-#20, see
// normalize/game.ts) — keeps player.team_id current so later features
// (roster, player page) have something to build on, but never touches
// jersey/position/photo, which dedicated player ingestion will own once it
// exists.
export async function upsertPlayerStub(
  stub: NormalizedPlayerStub,
  teamId: string,
): Promise<string> {
  const values = { ...stub, teamId };
  const [row] = await db
    .insert(player)
    .values(values)
    .onConflictDoUpdate({ target: [player.provider, player.providerRef], set: values })
    .returning({ id: player.id });
  if (!row) {
    throw new Error(`Failed to upsert player ${stub.fullName}`);
  }
  return row.id;
}
