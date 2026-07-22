import type { PlayerProfile, SeasonAverages } from "@hooply/shared";
import { router, useLocalSearchParams } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet } from "react-native";

import { PlayerGameLog } from "@/components/PlayerGameLog";
import { Text, View } from "@/components/Themed";
import { usePlayer } from "@/hooks/usePlayer";
import { teamHref } from "@/lib/links";
import { formatAvg, formatPhysicals, formatRatioPct } from "@/lib/player";

export default function PlayerPageScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { data: profile, isLoading, isError } = usePlayer(id);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading player…</Text>
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View style={styles.centered}>
        <Text>{name ? `Couldn't load ${name}.` : "Couldn't load this player."}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <PlayerHeader profile={profile} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Season averages</Text>
        <SeasonAveragesCards averages={profile.season_averages} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game log</Text>
      </View>
      <PlayerGameLog playerId={id} />
    </ScrollView>
  );
}

function PlayerHeader({ profile }: { profile: PlayerProfile }) {
  const physicals = formatPhysicals(profile.height_cm, profile.weight_kg);
  const team = profile.team;

  return (
    <View style={styles.header}>
      {profile.photo_url ? (
        <Image source={{ uri: profile.photo_url }} style={styles.photo} />
      ) : (
        <View style={styles.photoPlaceholder} />
      )}
      <Text style={styles.name}>{profile.full_name}</Text>
      {team ? (
        <Pressable onPress={() => router.push(teamHref(team))}>
          <Text style={styles.team}>{team.name}</Text>
        </Pressable>
      ) : (
        <Text style={styles.team}>Free Agent</Text>
      )}
      <Text style={styles.meta}>
        {[profile.position, profile.jersey_number !== null ? `#${profile.jersey_number}` : null]
          .filter(Boolean)
          .join(" · ") || "–"}
      </Text>
      {physicals ? <Text style={styles.meta}>{physicals}</Text> : null}
      {profile.country ? <Text style={styles.meta}>{profile.country}</Text> : null}
    </View>
  );
}

const STAT_CARDS: { label: string; value: (a: SeasonAverages) => string }[] = [
  { label: "PPG", value: (a) => formatAvg(a.ppg) },
  { label: "RPG", value: (a) => formatAvg(a.rpg) },
  { label: "APG", value: (a) => formatAvg(a.apg) },
  { label: "MPG", value: (a) => formatAvg(a.mpg) },
  { label: "FG%", value: (a) => formatRatioPct(a.fg_pct) },
  { label: "3P%", value: (a) => formatRatioPct(a.three_pct) },
  { label: "FT%", value: (a) => formatRatioPct(a.ft_pct) },
];

function SeasonAveragesCards({ averages }: { averages: SeasonAverages | null }) {
  if (!averages) {
    return <Text style={styles.placeholderText}>No games played this season</Text>;
  }

  return (
    <View style={styles.statGrid}>
      {STAT_CARDS.map((card) => (
        <View key={card.label} style={styles.statCard}>
          <Text style={styles.statValue}>{card.value(averages)}</Text>
          <Text style={styles.statLabel}>{card.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", gap: 4, paddingTop: 32, paddingBottom: 16 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  photoPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#ccc" },
  name: { fontSize: 20, fontWeight: "bold", marginTop: 8 },
  team: { fontSize: 14, fontWeight: "600", color: "#2f95dc" },
  meta: { fontSize: 13, opacity: 0.6 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: "700", opacity: 0.6, marginBottom: 8 },
  placeholderText: { fontSize: 14, opacity: 0.5 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "22%",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#8881",
  },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 11, opacity: 0.6, marginTop: 2 },
});
