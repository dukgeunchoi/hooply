import type { Game } from "@hooply/shared";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
} from "react-native";

import { GameRow } from "@/components/GameRow";
import { Text, View } from "@/components/Themed";
import { useLeagueGames } from "@/hooks/useLeagueGames";
import { addDays, toDateParam } from "@/lib/dates";

const INITIAL_WINDOW_DAYS = 14;
const EXPAND_DAYS = 14;
const MAX_WINDOW_DAYS = 90;
const EDGE_THRESHOLD_PX = 80;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function groupByDate(games: readonly Game[]): { date: string; games: Game[] }[] {
  const sections: { date: string; games: Game[] }[] = [];
  const byDate = new Map<string, Game[]>();
  for (const g of games) {
    const key = toDateParam(new Date(g.tipoff_at));
    let bucket = byDate.get(key);
    if (!bucket) {
      bucket = [];
      byDate.set(key, bucket);
      sections.push({ date: key, games: bucket });
    }
    bucket.push(g);
  }
  return sections;
}

function formatSectionDate(dateParam: string): string {
  const [year, month, day] = dateParam.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`formatSectionDate: malformed date "${dateParam}"`);
  }
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Infinite scroll in both directions (docs/screens.md): the query window
// widens by EXPAND_DAYS whenever the user scrolls near either edge, capped
// at MAX_WINDOW_DAYS total so a determined scroller can't grow it forever.
export function MatchesList({ leagueId }: { leagueId: string }) {
  const today = useMemo(() => new Date(), []);
  const [range, setRange] = useState(() => ({
    from: addDays(today, -INITIAL_WINDOW_DAYS),
    to: addDays(today, INITIAL_WINDOW_DAYS),
  }));
  const loadingMoreRef = useRef(false);

  const {
    data: games,
    isLoading,
    isFetching,
    isError,
  } = useLeagueGames(leagueId, toDateParam(range.from), toDateParam(range.to));

  useEffect(() => {
    if (!isFetching) loadingMoreRef.current = false;
  }, [isFetching]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (loadingMoreRef.current) return;
    const windowDays = (range.to.getTime() - range.from.getTime()) / MS_PER_DAY;
    if (windowDays >= MAX_WINDOW_DAYS) return;

    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y < EDGE_THRESHOLD_PX) {
      loadingMoreRef.current = true;
      setRange((r) => ({ ...r, from: addDays(r.from, -EXPAND_DAYS) }));
    } else if (
      contentOffset.y + layoutMeasurement.height >
      contentSize.height - EDGE_THRESHOLD_PX
    ) {
      loadingMoreRef.current = true;
      setRange((r) => ({ ...r, to: addDays(r.to, EXPAND_DAYS) }));
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading matches…</Text>
      </View>
    );
  }

  if (isError || !games) {
    return (
      <View style={styles.centered}>
        <Text>Couldn't load matches.</Text>
      </View>
    );
  }

  const sections = groupByDate(games);

  if (sections.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No matches in this range</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} onScroll={handleScroll} scrollEventThrottle={200}>
      {sections.map((section) => (
        <View key={section.date}>
          <Text style={styles.sectionHeader}>{formatSectionDate(section.date)}</Text>
          {section.games.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              onPress={() => router.push({ pathname: "/game/[id]", params: { id: game.id } })}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
});
