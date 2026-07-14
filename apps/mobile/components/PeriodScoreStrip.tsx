import type { GameDetail } from "@hooply/shared";
import { StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { teamLabel } from "@/lib/gameStatus";

// Index 0-3 are Q1-Q4; anything beyond that is overtime. Handles any number
// of OT periods (issue #17 acceptance criteria), not just a single OT slot.
function periodLabel(index: number): string {
  if (index < 4) return `Q${index + 1}`;
  const otNumber = index - 3;
  return otNumber === 1 ? "OT" : `OT${otNumber}`;
}

type Side = Pick<GameDetail["home"], "team" | "score" | "period_scores">;

export function PeriodScoreStrip({ home, away }: { home: Side; away: Side }) {
  const periodCount = Math.max(home.period_scores.length, away.period_scores.length);
  // Nothing to show pre-tipoff (no periods have been played yet).
  if (periodCount === 0) return null;

  const periods = Array.from({ length: periodCount }, (_, i) => i);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.cell, styles.teamCell, styles.headerText]} />
        {periods.map((i) => (
          <Text key={i} style={[styles.cell, styles.headerText]}>
            {periodLabel(i)}
          </Text>
        ))}
        <Text style={[styles.cell, styles.headerText]}>T</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.cell, styles.teamCell]} numberOfLines={1}>
          {teamLabel(home.team)}
        </Text>
        {periods.map((i) => (
          <Text key={i} style={styles.cell}>
            {home.period_scores[i] ?? "-"}
          </Text>
        ))}
        <Text style={[styles.cell, styles.totalCell]}>{home.score}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.cell, styles.teamCell]} numberOfLines={1}>
          {teamLabel(away.team)}
        </Text>
        {periods.map((i) => (
          <Text key={i} style={styles.cell}>
            {away.period_scores[i] ?? "-"}
          </Text>
        ))}
        <Text style={[styles.cell, styles.totalCell]}>{away.score}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  cell: { width: 28, fontSize: 12, textAlign: "center" },
  teamCell: { flex: 1, width: undefined, textAlign: "left", fontWeight: "600" },
  headerText: { opacity: 0.5, fontWeight: "700" },
  totalCell: { fontWeight: "700" },
});
