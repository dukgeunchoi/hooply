import type { GameDetail, PlayerBoxScore } from "@hooply/shared";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet } from "react-native";

import { BoxScoreTable } from "@/components/BoxScoreTable";
import { PeriodScoreStrip } from "@/components/PeriodScoreStrip";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Text, View } from "@/components/Themed";
import { useAppIsActive } from "@/hooks/useAppIsActive";
import type { BoxScoreResult } from "@/hooks/useBoxScore";
import { useBoxScore } from "@/hooks/useBoxScore";
import { useGameDetail } from "@/hooks/useGameDetail";
import { topPerformers } from "@/lib/boxscore";
import { hasScore, statusLabel, teamLabel } from "@/lib/gameStatus";
import { teamHref } from "@/lib/links";

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

  // Fetched once whenever the screen is visible (the Summary tab's top
  // performers need it too, not just Box Score), but only re-polled every
  // ~30s while the Box Score tab is open and the game is live (issue #18).
  const boxScoreQuery = useBoxScore(id, {
    enabled: screenIsVisible,
    poll: screenIsVisible && tab === "boxscore" && game?.status === "live",
  });

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
        <SummaryTab game={game} boxScore={boxScoreQuery.data} />
      ) : tab === "boxscore" ? (
        <BoxScoreTab result={boxScoreQuery.data} isLoading={boxScoreQuery.isLoading} />
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
    <Pressable style={styles.teamColumn} onPress={() => router.push(teamHref(side.team))}>
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

function PerformerList({ label, players }: { label: string; players: PlayerBoxScore[] }) {
  return (
    <View style={styles.performerGroup}>
      <Text style={styles.performerTeam}>{label}</Text>
      {players.map((p) => (
        <View key={p.player.id} style={styles.performerRow}>
          <Text style={styles.performerName} numberOfLines={1}>
            {p.player.name}
          </Text>
          <Text style={styles.performerPts}>{p.stats.points} PTS</Text>
        </View>
      ))}
    </View>
  );
}

// Top 3 by points per team (docs/screens.md), sourced from the same box
// score fetch the Box Score tab uses — 404 ("not yet available") shows the
// same placeholder it did before #18 shipped ingestion for this data.
function TopPerformers({ boxScore }: { boxScore: BoxScoreResult | undefined }) {
  if (!boxScore?.available) {
    return <Text style={styles.placeholderText}>Not yet available</Text>;
  }
  const { team_stats, player_stats } = boxScore.envelope.data;
  return (
    <>
      <PerformerList
        label={teamLabel(team_stats.home.team)}
        players={topPerformers(player_stats.home)}
      />
      <PerformerList
        label={teamLabel(team_stats.away.team)}
        players={topPerformers(player_stats.away)}
      />
    </>
  );
}

function SummaryTab({
  game,
  boxScore,
}: { game: GameDetail; boxScore: BoxScoreResult | undefined }) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top performers</Text>
        <TopPerformers boxScore={boxScore} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Venue</Text>
        <Text>{game.venue ?? "TBD"}</Text>
      </View>
    </ScrollView>
  );
}

function BoxScoreTab({
  result,
  isLoading,
}: {
  result: BoxScoreResult | undefined;
  isLoading: boolean;
}) {
  if (isLoading && !result) {
    return (
      <View style={styles.centered}>
        <Text>Loading box score…</Text>
      </View>
    );
  }

  // Not an error state — a game with no stats yet 404s (docs/api-spec.md).
  if (!result?.available) {
    return (
      <View style={styles.centered}>
        <Text>Stats not yet available</Text>
      </View>
    );
  }

  const { team_stats, player_stats } = result.envelope.data;
  return (
    <ScrollView style={styles.container}>
      <BoxScoreTable teamStats={team_stats.home} players={player_stats.home} />
      <BoxScoreTable teamStats={team_stats.away} players={player_stats.away} />
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
  performerGroup: { marginBottom: 12 },
  performerTeam: { fontSize: 12, fontWeight: "700", opacity: 0.6, marginBottom: 4 },
  performerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  performerName: { fontSize: 14, flex: 1 },
  performerPts: { fontSize: 14, fontWeight: "600" },
});
