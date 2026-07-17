import type { FavoriteEntityType } from "@hooply/shared";
import { favoritesResponseSchema, registerDeviceResponseSchema } from "@hooply/shared";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { apiPost, apiPut } from "./api";
import { getDeviceId } from "./deviceId";
import { mmkvStorageAdapter } from "./mmkv";

export type FavoriteItem = {
  entity_type: FavoriteEntityType;
  entity_id: string;
  name: string;
  logo_url: string | null;
};

type FavoritesState = {
  favorites: FavoriteItem[];
  // Persisted once POST /v1/devices has succeeded for this install, so a
  // later app launch doesn't re-register. Stays false (and is retried on
  // the next favorites change) if the call never completed, e.g. offline.
  deviceRegistered: boolean;
  isFollowing: (entityType: FavoriteEntityType, entityId: string) => boolean;
  follow: (item: FavoriteItem) => void;
  unfollow: (entityType: FavoriteEntityType, entityId: string) => void;
};

// No notification-permission flow exists yet (push notifications are #22,
// onboarding is #23) — the device registers itself lazily, the first time a
// favorite is followed, with push_token: null. A later call from #22 with
// the real Expo push token upserts in place (ADR-0004), it doesn't need a
// second registration path.
let registrationPromise: Promise<void> | null = null;
function ensureDeviceRegistered(): Promise<void> {
  if (useFavoritesStore.getState().deviceRegistered) return Promise.resolve();
  if (registrationPromise) return registrationPromise;

  registrationPromise = apiPost(
    "/v1/devices",
    {
      device_id: getDeviceId(),
      platform: Platform.OS === "ios" ? "ios" : "android",
      push_token: null,
    },
    registerDeviceResponseSchema,
  )
    .then(() => {
      useFavoritesStore.setState({ deviceRegistered: true });
    })
    .finally(() => {
      registrationPromise = null;
    });

  return registrationPromise;
}

// Best-effort: favorites are already persisted on-device (the source of
// truth for UI ordering) by the time this runs. A failed sync self-heals on
// the next local change, since PUT always sends the full list — see
// docs/api-spec.md.
async function syncFavoritesToServer(favorites: FavoriteItem[]) {
  try {
    await ensureDeviceRegistered();
    await apiPut(
      `/v1/devices/${getDeviceId()}/favorites`,
      { favorites: favorites.map((f) => ({ entity_type: f.entity_type, entity_id: f.entity_id })) },
      favoritesResponseSchema,
    );
  } catch {
    // swallow — see comment above
  }
}

function isSameEntity(item: FavoriteItem, entityType: FavoriteEntityType, entityId: string) {
  return item.entity_type === entityType && item.entity_id === entityId;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      deviceRegistered: false,
      isFollowing: (entityType, entityId) =>
        get().favorites.some((f) => isSameEntity(f, entityType, entityId)),
      follow: (item) => {
        if (get().isFollowing(item.entity_type, item.entity_id)) return;
        const next = [...get().favorites, item];
        set({ favorites: next });
        void syncFavoritesToServer(next);
      },
      unfollow: (entityType, entityId) => {
        const next = get().favorites.filter((f) => !isSameEntity(f, entityType, entityId));
        set({ favorites: next });
        void syncFavoritesToServer(next);
      },
    }),
    {
      name: "hooply.favorites",
      storage: createJSONStorage(() => mmkvStorageAdapter),
    },
  ),
);
