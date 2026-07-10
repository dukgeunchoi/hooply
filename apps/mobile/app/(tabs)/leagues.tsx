import { router } from "expo-router";
import { FlatList, Image, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { useLeagues } from "@/hooks/useLeagues";

export default function LeaguesScreen() {
  const { data: leagues, isLoading, isError } = useLeagues();

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading leagues…</Text>
      </View>
    );
  }

  if (isError || !leagues) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load leagues.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={leagues}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({ pathname: "/league/[id]", params: { id: item.id, name: item.name } })
            }
          >
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder} />
            )}
            <Text style={styles.name}>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  logo: { width: 32, height: 32, borderRadius: 16 },
  logoPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#ccc" },
  name: { fontSize: 16, fontWeight: "600" },
});
