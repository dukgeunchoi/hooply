import type { PlayerBoxScore, TeamBoxScore } from "@hooply/shared";
import { StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { formatMinutes, formatPct, formatPlusMinus } from "@/lib/boxscore";
import { teamLabel } from "@/lib/gameStatus";

const COLUMNS: { label: string; key: keyof PlayerBoxScore["stats"] | "min" | "pm" }[] = [
  { label: "MIN", key: "min" },
  { label: "PTS", key: "points" },
  { label: "REB", key: "rebounds_total" },
  { label: "AST", key: "assists" },
  { label: "±", key: "pm" },
  { label: "FG%", key: "fg_made" },
  { label: "3P%", key: "three_made" },
  { label: "FT%", key: "ft_made" },
];

function statCell(player: PlayerBoxScore, key: (typeof COLUMNS)[number]["key"]): string {
  switch (key) {
    case "min":
      return formatMinutes(player.seconds_played);
    case "pm":
      return formatPlusMinus(player.plus_minus);
    case "fg_made":
      return formatPct(player.stats.fg_made, player.stats.fg_att);
    case "three_made":
      return formatPct(player.stats.three_made, player.stats.three_att);
    case "ft_made":
      return formatPct(player.stats.ft_made, player.stats.ft_att);
    default:
      return String(player.stats[key]);
  }
}

// Team totals have no minutes/plus-minus of their own — driven off the same
// COLUMNS list as the header/player rows so adding a column can't silently
// leave the totals row out of sync.
function totalsCell(teamStats: TeamBoxScore, key: (typeof COLUMNS)[number]["key"]): string {
  switch (key) {
    case "min":
    case "pm":
      return "–";
    case "fg_made":
      return formatPct(teamStats.stats.fg_made, teamStats.stats.fg_att);
    case "three_made":
      return formatPct(teamStats.stats.three_made, teamStats.stats.three_att);
    case "ft_made":
      return formatPct(teamStats.stats.ft_made, teamStats.stats.ft_att);
    default:
      return String(teamStats.stats[key]);
  }
}

// Starters-first ordering is already guaranteed server-side (see
// packages/db's getBoxScore query) — this just renders whatever order it's
// given, plus a team totals row from team_stats at the bottom.
export function BoxScoreTable({
  teamStats,
  players,
}: {
  teamStats: TeamBoxScore;
  players: PlayerBoxScore[];
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.teamName}>{teamLabel(teamStats.team)}</Text>

      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cell, styles.nameCell, styles.headerText]}>Player</Text>
        {COLUMNS.map((col) => (
          <Text key={col.label} style={[styles.cell, styles.headerText]}>
            {col.label}
          </Text>
        ))}
      </View>

      {players.map((player) => (
        <View key={player.player.id} style={styles.row}>
          <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
            {player.player.name}
          </Text>
          {COLUMNS.map((col) => (
            <Text key={col.label} style={styles.cell}>
              {statCell(player, col.key)}
            </Text>
          ))}
        </View>
      ))}

      <View style={[styles.row, styles.totalsRow]}>
        <Text style={[styles.cell, styles.nameCell, styles.totalsText]}>Totals</Text>
        {COLUMNS.map((col) => (
          <Text key={col.label} style={[styles.cell, styles.totalsText]}>
            {totalsCell(teamStats, col.key)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 20 },
  teamName: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  headerRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#8888" },
  headerText: { opacity: 0.5, fontWeight: "700", fontSize: 11 },
  cell: { width: 36, fontSize: 12, textAlign: "center" },
  nameCell: { flex: 1, width: undefined, textAlign: "left", fontWeight: "600" },
  totalsRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8888", marginTop: 2 },
  totalsText: { fontWeight: "700" },
});
