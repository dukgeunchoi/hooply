import * as Crypto from "expo-crypto";
import { storage } from "./mmkv";

const DEVICE_ID_KEY = "hooply.deviceId";

// Generated once per install and persisted — this is the client-generated
// UUID the API upserts on (see ADR-0004 and POST /v1/devices). Regenerating
// it would look like a reinstall to the server and drop favorites, so it's
// cached in module scope after the first read/write.
let cachedDeviceId: string | undefined;

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = storage.getString(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const id = Crypto.randomUUID();
  storage.set(DEVICE_ID_KEY, id);
  cachedDeviceId = id;
  return id;
}
