import type { GameDetail } from "@hooply/shared";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet } from "react-native";

import { PeriodScoreStrip } from "@/components/PeriodScoreStrip";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Text, View } from "@/components/Themed";
import { useAppIsActive } from "@/hooks/useAppIsActive";
import { useGameDetail } from "@/hooks/useGameDetail";
import { hasScore, statusLabel, teamLabel } from "@/lib/gameStatus";

type Tab = "summary" | "boxscore" | "plays";

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("summary");

  // Same "stop polling when the screen isn't visible" gate as the Scores
  // screen (issue #16) — useIsFocused alone misses backgrounding.
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const screenIsVisible = isFocused && isAppActive;

  const { data: envelope, isLoading, isError } = useGameDetail(id, { enabled: screenIsVisible });
  const game = envelope?.data;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading game…</Text>
      </View>
    );
  }

  if (isError || !game) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load this game.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {envelope?.meta.delayed ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Live scores may be delayed</Text>
        </View>
      ) : null}

      <GameHeader game={game} />

      <SegmentedControl
        options={[
          { value: "summary" as const, label: "Summary" },
          { value: "boxscore" as const, label: "Box Score" },
          { value: "plays" as const, label: "Plays" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "summary" ? (
        <SummaryTab game={game} />
      ) : (
        <View style={styles.centered}>
          <Text>Coming soon</Text>
        </View>
      )}
    </View>
  );
}

function TeamColumn({ side }: { side: GameDetail["home"] }) {
  return (
    <Pressable
      style={styles.teamColumn}
      onPress={() =>
        router.push({
          pathname: "/team/[id]",
          params: { id: side.team.id, name: side.team.name },
        })
      }
    >
      {side.team.logo_url ? (
        <Image source={{ uri: side.team.logo_url }} style={styles.teamLogo} />
      ) : (
        <View style={styles.teamLogoPlaceholder} />
      )}
      <Text style={styles.teamCode}>{teamLabel(side.team)}</Text>
    </Pressable>
  );
}

function GameHeader({ game }: { game: GameDetail }) {
  return (
    <View style={styles.header}>
      <View style={styles.teamsRow}>
        <TeamColumn side={game.home} />
        <View style={styles.scoreBlock}>
          {hasScore(game) ? (
            <Text style={styles.score}>
              {game.home.score} – {game.away.score}
            </Text>
          ) : null}
          <Text style={styles.status}>{statusLabel(game)}</Text>
        </View>
        <TeamColumn side={game.away} />
      </View>
      <PeriodScoreStrip home={game.home} away={game.away} />
    </View>
  );
}

// Top performers stays a placeholder until #18 ships box score ingestion —
// there's no player_game_stat data to source it from yet.
function SummaryTab({ game }: { game: GameDetail }) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top performers</Text>
        <Text style={styles.placeholderText}>Not yet available</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Venue</Text>
        <Text>{game.venue ?? "TBD"}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#f5a623", paddingVertical: 6, alignItems: "center" },
  bannerText: { color: "#000", fontSize: 13, fontWeight: "600" },
  header: { paddingTop: 16, paddingBottom: 8 },
  teamsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  teamColumn: { alignItems: "center", gap: 6, width: 88 },
  teamLogo: { width: 48, height: 48 },
  teamLogoPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#ccc" },
  teamCode: { fontSize: 15, fontWeight: "700" },
  scoreBlock: { alignItems: "center", gap: 4 },
  score: { fontSize: 32, fontWeight: "800" },
  status: { fontSize: 13, opacity: 0.6 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "700", opacity: 0.6, marginBottom: 8 },
  placeholderText: { fontSize: 14, opacity: 0.5 },
});
