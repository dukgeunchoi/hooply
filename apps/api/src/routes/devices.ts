import { queries } from "@hooply/db";
import {
  makeEnvelope,
  makeErrorEnvelope,
  putFavoritesRequestSchema,
  registerDeviceRequestSchema,
} from "@hooply/shared";
import { Router } from "express";

type DevicesQueries = Pick<typeof queries, "upsertDevice" | "replaceFavorites">;

// `devicesQueries` defaults to the real Postgres-backed read/write model
// (`@hooply/db`'s `queries`) but can be swapped for a fake in tests — the
// route itself only does body/param validation, 404/400 branching, and
// envelope wrapping; the upsert/token-steal and full-replace logic lives in
// the query module (see ADR-0004).
export function createDevicesRouter(devicesQueries: DevicesQueries = queries): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = registerDeviceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(makeErrorEnvelope("bad_request", "Malformed device registration"));
      return;
    }

    const { device_id, platform, push_token } = parsed.data;
    const row = await devicesQueries.upsertDevice({
      deviceId: device_id,
      platform,
      pushToken: push_token ?? null,
    });

    res.set("Cache-Control", "no-store");
    res.json(
      makeEnvelope({ device_id: row.id, platform: row.platform, push_token: row.pushToken }),
    );
  });

  router.put("/:deviceId/favorites", async (req, res) => {
    const parsed = putFavoritesRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(makeErrorEnvelope("bad_request", "Malformed favorites list"));
      return;
    }

    const favorites = await devicesQueries.replaceFavorites(
      req.params.deviceId,
      parsed.data.favorites.map((f) => ({ entityType: f.entity_type, entityId: f.entity_id })),
    );
    if (!favorites) {
      res.status(404).json(makeErrorEnvelope("not_found", "Device not found"));
      return;
    }

    res.set("Cache-Control", "no-store");
    res.json(makeEnvelope(favorites));
  });

  return router;
}
