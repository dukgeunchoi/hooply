import { useNetInfo } from "@react-native-community/netinfo";
import { useIsFocused } from "expo-router";
import { useState } from "react";
import { Image, ScrollView, StyleSheet } from "react-native";

import { DateStrip } from "@/components/DateStrip";
import { GameRow } from "@/components/GameRow";
import { Text, View } from "@/components/Themed";
import { useAppIsActive } from "@/hooks/useAppIsActive";
import { useGames } from "@/hooks/useGames";
import { useLiveGames } from "@/hooks/useLiveGames";
import { toDateParam } from "@/lib/dates";
import { hasLiveGame, mergeLiveGames } from "@/lib/mergeLiveGames";

export default function ScoresScreen() {
  const [today] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const { isConnected } = useNetInfo();

  // "All polling stops when the screen loses focus (app backgrounded or
  // navigated away)" (issue #16) — both halves are needed: useIsFocused
  // alone misses backgrounding while the Scores tab stays active.
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const screenIsVisible = isFocused && isAppActive;

  const {
    data: gamesEnvelope,
    isLoading,
    isError,
  } = useGames(toDateParam(selectedDate), { enabled: screenIsVisible });
  const leagueGroups = gamesEnvelope?.data;

  // Fast poll only while visible AND the slow poll currently reports a live
  // game — gate lives in lib/mergeLiveGames.ts so it's driven off the same
  // "is any game live" rule used to decide whether to merge anything.
  const { data: liveEnvelope } = useLiveGames(
    screenIsVisible && (leagueGroups ? hasLiveGame(leagueGroups) : false),
  );

  const mergedGroups =
    leagueGroups && liveEnvelope ? mergeLiveGames(leagueGroups, liveEnvelope.data) : leagueGroups;

  const showOfflineBanner = isConnected === false && leagueGroups !== undefined;
  const showDelayedBanner =
    !showOfflineBanner && Boolean(gamesEnvelope?.meta.delayed || liveEnvelope?.meta.delayed);

  return (
    <View style={styles.container}>
      <DateStrip selected={selectedDate} today={today} onSelect={setSelectedDate} />

      {showOfflineBanner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>You're offline — showing last loaded scores</Text>
        </View>
      ) : showDelayedBanner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Live scores may be delayed</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <Text>Loading games…</Text>
        </View>
      ) : isError && !mergedGroups ? (
        <View style={styles.centered}>
          <Text>Couldn't load games.</Text>
        </View>
      ) : mergedGroups && mergedGroups.length === 0 ? (
        <View style={styles.centered}>
          <Text>No games today</Text>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {mergedGroups?.map((group) => (
            <View key={group.league.id} style={styles.leagueGroup}>
              <View style={styles.leagueHeader}>
                {group.league.logo_url ? (
                  <Image source={{ uri: group.league.logo_url }} style={styles.leagueLogo} />
                ) : null}
                <Text style={styles.leagueName}>{group.league.name}</Text>
              </View>
              {group.games.map((game) => (
                <GameRow key={game.id} game={game} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  banner: { backgroundColor: "#f5a623", paddingVertical: 6, alignItems: "center" },
  bannerText: { color: "#000", fontSize: 13, fontWeight: "600" },
  leagueGroup: { marginBottom: 8 },
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  leagueLogo: { width: 20, height: 20 },
  leagueName: { fontSize: 14, fontWeight: "700", opacity: 0.8 },
});
