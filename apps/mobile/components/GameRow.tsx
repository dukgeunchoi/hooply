import type { Game } from "@hooply/shared";
import { StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { formatTipoff } from "@/lib/dates";

function teamLabel(team: Game["home"]["team"]): string {
  return team.code ?? team.name;
}

function statusLabel(game: Game): string {
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

export function GameRow({ game }: { game: Game }) {
  const hasScore = game.status !== "scheduled" && game.status !== "postponed";

  return (
    <View style={styles.row}>
      <Text style={styles.matchup}>
        {teamLabel(game.home.team)}
        {hasScore ? ` ${game.home.score}` : ""}
        {"  —  "}
        {hasScore ? `${game.away.score} ` : ""}
        {teamLabel(game.away.team)}
      </Text>
      <Text style={styles.status}>{statusLabel(game)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  matchup: { fontSize: 15, fontWeight: "600" },
  status: { fontSize: 13, opacity: 0.6 },
});
