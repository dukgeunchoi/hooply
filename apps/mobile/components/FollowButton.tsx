import type { FavoriteEntityType } from "@hooply/shared";
import { Pressable, StyleSheet } from "react-native";

import { Text } from "@/components/Themed";
import { useFavoritesStore } from "@/lib/favoritesStore";

// The one follow/unfollow control used everywhere the issue #19 spec calls
// for it: Team Page header, League Hub header, Search results (inline),
// Following screen (inline unfollow).
export function FollowButton({
  entityType,
  entityId,
  name,
  logoUrl,
}: {
  entityType: FavoriteEntityType;
  entityId: string;
  name: string;
  logoUrl: string | null;
}) {
  const following = useFavoritesStore((s) => s.isFollowing(entityType, entityId));
  const follow = useFavoritesStore((s) => s.follow);
  const unfollow = useFavoritesStore((s) => s.unfollow);

  return (
    <Pressable
      style={[styles.button, following ? styles.buttonFollowing : null]}
      onPress={() =>
        following
          ? unfollow(entityType, entityId)
          : follow({ entity_type: entityType, entity_id: entityId, name, logo_url: logoUrl })
      }
    >
      <Text style={[styles.text, following ? styles.textFollowing : null]}>
        {following ? "★ Following" : "☆ Follow"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f95dc",
  },
  buttonFollowing: { backgroundColor: "#2f95dc" },
  text: { fontSize: 13, fontWeight: "600", color: "#2f95dc" },
  textFollowing: { color: "#fff" },
});
