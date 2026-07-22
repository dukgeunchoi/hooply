import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, ScrollView, StyleSheet } from "react-native";

import { FollowButton } from "@/components/FollowButton";
import { GameRow } from "@/components/GameRow";
import { RosterList } from "@/components/RosterList";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Text, View } from "@/components/Themed";
import { useTeam } from "@/hooks/useTeam";
import { useTeamGames } from "@/hooks/useTeamGames";
import { useTeamRoster } from "@/hooks/useTeamRoster";
import { standingLabel } from "@/lib/teamStanding";

type Tab = "matches" | "roster";

export default function TeamPageScreen() {
  const { id, name, logo } = useLocalSearchParams<{ id: string; name?: string; logo?: string }>();
  const [tab, setTab] = useState<Tab>("matches");

  const { data: profile } = useTeam(id);

  const displayName = profile?.name ?? name ?? "Team";
  const logoUrl = profile?.logo_url ?? logo ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
        <Text style={styles.title}>{displayName}</Text>
        {profile?.league ? <Text style={styles.subtitle}>{profile.league.name}</Text> : null}
        {profile?.standing ? (
          <Text style={styles.record}>{standingLabel(profile.standing)}</Text>
        ) : null}
        <FollowButton entityType="team" entityId={id} name={displayName} logoUrl={logoUrl} />
      </View>

      <SegmentedControl
        options={[
          { value: "matches" as const, label: "Matches" },
          { value: "roster" as const, label: "Roster" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "matches" ? <MatchesTab teamId={id} /> : <RosterTab teamId={id} />}
    </View>
  );
}

function MatchesTab({ teamId }: { teamId: string }) {
  const upcoming = useTeamGames(teamId, "upcoming");
  const past = useTeamGames(teamId, "past");

  if (upcoming.isLoading || past.isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading matches…</Text>
      </View>
    );
  }

  if (upcoming.isError || past.isError || !upcoming.data || !past.data) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load matches.</Text>
      </View>
    );
  }

  if (upcoming.data.length === 0 && past.data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No games scheduled</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {upcoming.data.length > 0 ? (
        <View>
          <Text style={styles.sectionHeader}>Upcoming</Text>
          {upcoming.data.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              onPress={() => router.push({ pathname: "/game/[id]", params: { id: game.id } })}
            />
          ))}
        </View>
      ) : null}
      {past.data.length > 0 ? (
        <View>
          <Text style={styles.sectionHeader}>Recent</Text>
          {past.data.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              onPress={() => router.push({ pathname: "/game/[id]", params: { id: game.id } })}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function RosterTab({ teamId }: { teamId: string }) {
  const { data: roster, isLoading, isError } = useTeamRoster(teamId);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading roster…</Text>
      </View>
    );
  }

  if (isError || !roster) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load roster.</Text>
      </View>
    );
  }

  return <RosterList players={roster} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  header: { alignItems: "center", gap: 6, paddingTop: 32, paddingBottom: 16 },
  logo: { width: 56, height: 56 },
  logoPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#ccc" },
  title: { fontSize: 20, fontWeight: "bold" },
  subtitle: { fontSize: 13, opacity: 0.6 },
  record: { fontSize: 14, fontWeight: "600" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
});
