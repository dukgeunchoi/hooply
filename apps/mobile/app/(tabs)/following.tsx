import type { Game, LeagueGames } from "@hooply/shared";
import { router, useIsFocused } from "expo-router";
import { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet } from "react-native";

import { FollowButton } from "@/components/FollowButton";
import { GameRow } from "@/components/GameRow";
import { Text, View } from "@/components/Themed";
import { useAppIsActive } from "@/hooks/useAppIsActive";
import { useGames } from "@/hooks/useGames";
import { toDateParam } from "@/lib/dates";
import { gameInvolvesAnyTeam, gameInvolvesTeam } from "@/lib/favoritesOrder";
import type { FavoriteItem } from "@/lib/favoritesStore";
import { useFavoritesStore } from "@/lib/favoritesStore";
import { statusLabel, teamLabel } from "@/lib/gameStatus";
import { leagueHref, teamHref } from "@/lib/links";

function flattenGames(groups: readonly LeagueGames[]): Game[] {
  return groups.flatMap((g) => g.games);
}

function opponentLabel(game: Game, teamId: string): string {
  const opponent = game.home.team.id === teamId ? game.away.team : game.home.team;
  return `vs ${teamLabel(opponent)}`;
}

// "Next game info" is scoped to what GET /v1/games?date= already gives us —
// a team schedule endpoint (GET /v1/teams/{id}/games) is issue #20, not yet
// built, so a followed team without a game today just shows as such rather
// than looking ahead.
function nextGameLabel(game: Game | undefined, teamId: string): string {
  if (!game) return "No game today";
  return `${opponentLabel(game, teamId)} · ${statusLabel(game)}`;
}

function FollowedTeamRow({ team, gameToday }: { team: FavoriteItem; gameToday: Game | undefined }) {
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowMain}
        onPress={() =>
          router.push(teamHref({ id: team.entity_id, name: team.name, logo_url: team.logo_url }))
        }
      >
        {team.logo_url ? (
          <Image source={{ uri: team.logo_url }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{team.name}</Text>
          <Text style={styles.rowSubtitle}>{nextGameLabel(gameToday, team.entity_id)}</Text>
        </View>
      </Pressable>
      <FollowButton
        entityType="team"
        entityId={team.entity_id}
        name={team.name}
        logoUrl={team.logo_url}
      />
    </View>
  );
}

function FollowedLeagueRow({ league }: { league: FavoriteItem }) {
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowMain}
        onPress={() =>
          router.push(
            leagueHref({ id: league.entity_id, name: league.name, logo_url: league.logo_url }),
          )
        }
      >
        {league.logo_url ? (
          <Image source={{ uri: league.logo_url }} style={styles.logo} />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
        <Text style={styles.rowTitle}>{league.name}</Text>
      </Pressable>
      <FollowButton
        entityType="league"
        entityId={league.entity_id}
        name={league.name}
        logoUrl={league.logo_url}
      />
    </View>
  );
}

export default function FollowingScreen() {
  const favorites = useFavoritesStore((s) => s.favorites);
  const today = useMemo(() => new Date(), []);

  // Same "stop polling when the screen isn't visible" gate as the Scores
  // and Game Detail screens (issue #16) — useIsFocused alone misses
  // backgrounding.
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const screenIsVisible = isFocused && isAppActive;

  const { data: gamesEnvelope, isLoading } = useGames(toDateParam(today), {
    enabled: screenIsVisible,
  });
  const todaysGroups = gamesEnvelope?.data ?? [];
  const todaysGames = useMemo(() => flattenGames(todaysGroups), [todaysGroups]);

  const followedTeams = favorites.filter((f) => f.entity_type === "team");
  const followedLeagues = favorites.filter((f) => f.entity_type === "league");
  const followedTeamIds = new Set(followedTeams.map((f) => f.entity_id));
  const followedLeagueIds = new Set(followedLeagues.map((f) => f.entity_id));

  const todayForYou = useMemo(() => {
    const leagueIdByGameId = new Map<string, string>();
    for (const group of todaysGroups) {
      for (const game of group.games) leagueIdByGameId.set(game.id, group.league.id);
    }
    return todaysGames.filter((game) => {
      if (gameInvolvesAnyTeam(game, followedTeamIds)) return true;
      const leagueId = leagueIdByGameId.get(game.id);
      return leagueId !== undefined && followedLeagueIds.has(leagueId);
    });
  }, [todaysGames, todaysGroups, followedTeamIds, followedLeagueIds]);

  if (favorites.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No favorites yet</Text>
        <Text style={styles.emptyBody}>Follow teams to get scores and notifications</Text>
        <Pressable style={styles.emptyButton} onPress={() => router.push("/leagues")}>
          <Text style={styles.emptyButtonText}>Browse leagues</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {followedTeams.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Teams</Text>
          {followedTeams.map((team) => (
            <FollowedTeamRow
              key={team.entity_id}
              team={team}
              gameToday={todaysGames.find((g) => gameInvolvesTeam(g, team.entity_id))}
            />
          ))}
        </View>
      ) : null}

      {followedLeagues.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leagues</Text>
          {followedLeagues.map((league) => (
            <FollowedLeagueRow key={league.entity_id} league={league} />
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today for you</Text>
        {isLoading ? (
          <Text style={styles.mutedText}>Loading…</Text>
        ) : todayForYou.length === 0 ? (
          <Text style={styles.mutedText}>No games today for your favorites</Text>
        ) : (
          todayForYou.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              onPress={() => router.push({ pathname: "/game/[id]", params: { id: game.id } })}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  emptyBody: { fontSize: 14, opacity: 0.6, textAlign: "center" },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2f95dc",
  },
  emptyButtonText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    opacity: 0.6,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  mutedText: { fontSize: 14, opacity: 0.5, paddingHorizontal: 16, paddingVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 32, height: 32, borderRadius: 16 },
  logoPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#ccc" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSubtitle: { fontSize: 12, opacity: 0.6, marginTop: 2 },
});
