import type { StandingGroup, StandingRow } from "@hooply/shared";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { teamHref } from "@/lib/links";

function formatPct(pct: number): string {
  return pct.toFixed(3).replace(/^0\./, ".");
}

function StandingRowView({ row }: { row: StandingRow }) {
  return (
    <Pressable style={styles.row} onPress={() => router.push(teamHref(row.team))}>
      <Text style={[styles.cell, styles.rankCell]}>{row.rank}</Text>
      <View style={styles.teamCell}>
        {row.team.logo_url ? (
          <Image source={{ uri: row.team.logo_url }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
        <Text style={styles.teamName} numberOfLines={1}>
          {row.team.code ?? row.team.name}
        </Text>
      </View>
      <Text style={styles.cell}>{row.played}</Text>
      <Text style={styles.cell}>{row.wins}</Text>
      <Text style={styles.cell}>{row.losses}</Text>
      <Text style={styles.cell}>{formatPct(row.win_pct)}</Text>
      <Text style={styles.cell}>
        {row.games_behind === null ? "-" : row.games_behind.toFixed(1)}
      </Text>
      <Text style={styles.cell}>{row.streak ?? "-"}</Text>
    </Pressable>
  );
}

export function StandingsTable({ groups }: { groups: StandingGroup[] }) {
  return (
    <View>
      {groups.map((group) => (
        <View key={group.label ?? "flat"}>
          {group.label ? <Text style={styles.groupLabel}>{group.label}</Text> : null}
          <View style={styles.headerRow}>
            <Text style={[styles.cell, styles.rankCell, styles.headerText]}>#</Text>
            <Text style={[styles.teamCell, styles.headerText]}>Team</Text>
            <Text style={[styles.cell, styles.headerText]}>P</Text>
            <Text style={[styles.cell, styles.headerText]}>W</Text>
            <Text style={[styles.cell, styles.headerText]}>L</Text>
            <Text style={[styles.cell, styles.headerText]}>Pct</Text>
            <Text style={[styles.cell, styles.headerText]}>GB</Text>
            <Text style={[styles.cell, styles.headerText]}>Strk</Text>
          </View>
          {group.standings.map((row) => (
            <StandingRowView key={row.team.id} row={row} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.7,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 6 },
  headerText: { fontSize: 11, fontWeight: "700", opacity: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  cell: { width: 32, fontSize: 13, textAlign: "center" },
  rankCell: { width: 24 },
  teamCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  teamName: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  logo: { width: 18, height: 18, borderRadius: 9 },
  logoPlaceholder: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#ccc" },
});
