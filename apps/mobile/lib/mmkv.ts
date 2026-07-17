import { createMMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

// The on-device store for favorites/device_id/notification prefs (docs/
// screens.md "Cross-cutting"). One instance for the whole app — MMKV is
// synchronous, so no loading state is needed before reading persisted data.
export const storage = createMMKV({ id: "hooply" });

// Adapts MMKV's sync get/set/remove to zustand persist's StateStorage
// interface (which is typed async but works fine with sync implementations).
export const mmkvStorageAdapter: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => {
    storage.remove(name);
  },
};
