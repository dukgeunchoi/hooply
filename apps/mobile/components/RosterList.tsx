import type { RosterPlayer } from "@hooply/shared";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { playerHref } from "@/lib/links";

// Players already arrive sorted by position (queries/teams.ts) — this just
// buckets them into position-labeled sections for display (mirrors
// MatchesList's client-side groupByDate).
function groupByPosition(
  players: readonly RosterPlayer[],
): { position: string; players: RosterPlayer[] }[] {
  const groups: { position: string; players: RosterPlayer[] }[] = [];
  const byPosition = new Map<string, RosterPlayer[]>();
  for (const p of players) {
    const key = p.position ?? "Other";
    let bucket = byPosition.get(key);
    if (!bucket) {
      bucket = [];
      byPosition.set(key, bucket);
      groups.push({ position: key, players: bucket });
    }
    bucket.push(p);
  }
  return groups;
}

function RosterRow({ player }: { player: RosterPlayer }) {
  return (
    <Pressable style={styles.row} onPress={() => router.push(playerHref(player))}>
      <Text style={styles.jersey}>{player.jersey_number ?? "–"}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {player.full_name}
      </Text>
    </Pressable>
  );
}

export function RosterList({ players }: { players: RosterPlayer[] }) {
  if (players.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No roster available yet</Text>
      </View>
    );
  }

  const groups = groupByPosition(players);

  return (
    <ScrollView style={styles.container}>
      {groups.map((group) => (
        <View key={group.position}>
          <Text style={styles.groupLabel}>{group.position}</Text>
          {group.players.map((p) => (
            <RosterRow key={p.id} player={p} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  groupLabel: {
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  jersey: { width: 32, fontSize: 14, fontWeight: "700", opacity: 0.6 },
  name: { fontSize: 15, fontWeight: "600", flexShrink: 1 },
});
