import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { FollowButton } from "@/components/FollowButton";
import { MatchesList } from "@/components/MatchesList";
import { SegmentedControl } from "@/components/SegmentedControl";
import { StandingsTable } from "@/components/StandingsTable";
import { Text, View } from "@/components/Themed";
import { useLeagueStandings } from "@/hooks/useLeagueStandings";

type Tab = "matches" | "standings";

export default function LeagueHubScreen() {
  const { id, name, logo } = useLocalSearchParams<{ id: string; name?: string; logo?: string }>();
  const [tab, setTab] = useState<Tab>("matches");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{name ?? "League"}</Text>
        <FollowButton
          entityType="league"
          entityId={id}
          name={name ?? "League"}
          logoUrl={logo ?? null}
        />
      </View>

      <SegmentedControl
        options={[
          { value: "matches" as const, label: "Matches" },
          { value: "standings" as const, label: "Standings" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "matches" ? <MatchesList leagueId={id} /> : <StandingsTab leagueId={id} />}
    </View>
  );
}

function StandingsTab({ leagueId }: { leagueId: string }) {
  const { data: groups, isLoading, isError } = useLeagueStandings(leagueId);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading standings…</Text>
      </View>
    );
  }
  if (isError || !groups) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load standings.</Text>
      </View>
    );
  }
  if (groups.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>Standings not available yet</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <StandingsTable groups={groups} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 20, fontWeight: "bold" },
});
