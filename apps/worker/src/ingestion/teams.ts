import { db, team } from "@hooply/db";
import type { NormalizedTeamStub } from "../normalize/game";

// Shared by games (#14) and standings (#15) ingestion, both of which
// encounter teams before any dedicated team-ingestion phase exists (no
// issue for it before #20). Only ever sets name/logoUrl, so it can't
// clobber columns (code, short_name, roster) that later team ingestion
// fills in.
export async function upsertTeamStub(stub: NormalizedTeamStub): Promise<string> {
  const [row] = await db
    .insert(team)
    .values(stub)
    .onConflictDoUpdate({ target: [team.provider, team.providerRef], set: stub })
    .returning({ id: team.id });
  if (!row) {
    throw new Error(`Failed to upsert team ${stub.name}`);
  }
  return row.id;
}
