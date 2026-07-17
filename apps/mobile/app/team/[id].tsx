import { useLocalSearchParams } from "expo-router";
import { Image, StyleSheet } from "react-native";

import { FollowButton } from "@/components/FollowButton";
import { Text, View } from "@/components/Themed";

// Full team profile (record, standing, Matches/Roster tabs) is issue #20 —
// this slice only needs the header far enough along to host the follow
// star (issue #19 acceptance criteria).
export default function TeamPageScreen() {
  const { id, name, logo } = useLocalSearchParams<{ id: string; name?: string; logo?: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
        <Text style={styles.title}>{name ?? "Team"}</Text>
        <FollowButton
          entityType="team"
          entityId={id}
          name={name ?? "Team"}
          logoUrl={logo ?? null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: "center", gap: 10, paddingTop: 32, paddingBottom: 16 },
  logo: { width: 56, height: 56 },
  logoPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#ccc" },
  title: { fontSize: 20, fontWeight: "bold" },
});
