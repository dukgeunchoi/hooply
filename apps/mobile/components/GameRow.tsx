import type { Game } from "@hooply/shared";
import { Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { hasScore, statusLabel, teamLabel } from "@/lib/gameStatus";

export function GameRow({ game, onPress }: { game: Game; onPress?: () => void }) {
  const showScore = hasScore(game);

  const row = (
    <View style={styles.row}>
      <Text style={styles.matchup}>
        {teamLabel(game.home.team)}
        {showScore ? ` ${game.home.score}` : ""}
        {"  —  "}
        {showScore ? `${game.away.score} ` : ""}
        {teamLabel(game.away.team)}
      </Text>
      {game.status === "suspended" ? (
        <View style={styles.suspendedBadge}>
          <Text style={styles.suspendedBadgeText}>Suspended</Text>
        </View>
      ) : (
        <Text style={styles.status}>{statusLabel(game)}</Text>
      )}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{row}</Pressable> : row;
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
  suspendedBadge: {
    backgroundColor: "#f5a623",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  suspendedBadgeText: { fontSize: 12, fontWeight: "700", color: "#000" },
});
