import type { PlayerGameLogRow } from "@hooply/shared";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { usePlayerGameLog } from "@/hooks/usePlayerGameLog";
import { formatMinutes } from "@/lib/boxscore";
import { teamLabel } from "@/lib/gameStatus";

const EDGE_THRESHOLD_PX = 80;

function ResultBadge({ result }: { result: "W" | "L" | null }) {
  if (result === null) return <Text style={styles.resultPending}>–</Text>;
  return (
    <Text style={[styles.result, result === "W" ? styles.resultWin : styles.resultLoss]}>
      {result}
    </Text>
  );
}

function GameLogRow({ row }: { row: PlayerGameLogRow }) {
  return (
    <View style={styles.row}>
      <ResultBadge result={row.result} />
      <Text style={styles.opponent} numberOfLines={1}>
        vs {teamLabel(row.opponent)}
      </Text>
      <Text style={styles.stat}>{formatMinutes(row.stats.seconds_played)}</Text>
      <Text style={styles.stat}>{row.stats.points}</Text>
      <Text style={styles.stat}>{row.stats.rebounds_total}</Text>
      <Text style={styles.stat}>{row.stats.assists}</Text>
    </View>
  );
}

// GET /v1/players/{id}/stats — infinite scroll (issue #20), same edge-
// detection idiom MatchesList already uses for its bidirectional scroll,
// simplified to one direction since the game log only paginates older.
export function PlayerGameLog({ playerId }: { playerId: string }) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePlayerGameLog(playerId);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasNextPage || isFetchingNextPage) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height > contentSize.height - EDGE_THRESHOLD_PX) {
      fetchNextPage();
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading game log…</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load game log.</Text>
      </View>
    );
  }

  const rows = data.pages.flatMap((page) => page.data);

  if (rows.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No games played this season</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} onScroll={handleScroll} scrollEventThrottle={200}>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.resultHeader, styles.headerText]} />
        <Text style={[styles.opponent, styles.headerText]}>OPP</Text>
        <Text style={[styles.stat, styles.headerText]}>MIN</Text>
        <Text style={[styles.stat, styles.headerText]}>PTS</Text>
        <Text style={[styles.stat, styles.headerText]}>REB</Text>
        <Text style={[styles.stat, styles.headerText]}>AST</Text>
      </View>
      {rows.map((row) => (
        <GameLogRow key={row.game.id} row={row} />
      ))}
      {isFetchingNextPage ? (
        <View style={styles.centered}>
          <Text>Loading more…</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  headerRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#8888" },
  headerText: { fontSize: 11, fontWeight: "700", opacity: 0.5 },
  resultHeader: { width: 24 },
  result: { width: 24, fontSize: 13, fontWeight: "800", textAlign: "center" },
  resultWin: { color: "#2e9e4f" },
  resultLoss: { color: "#c0392b" },
  resultPending: { width: 24, fontSize: 13, textAlign: "center", opacity: 0.4 },
  opponent: { flex: 1, fontSize: 14, fontWeight: "600" },
  stat: { width: 40, fontSize: 13, textAlign: "center" },
});
