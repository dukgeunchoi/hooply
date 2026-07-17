import { z } from "zod";
import { envelopeSchema } from "./envelope";

export const devicePlatformSchema = z.enum(["ios", "android"]);

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

// POST /v1/devices body. `push_token` is optional — the app registers a
// device (so favorites can sync) before the notification permission prompt
// exists (#22/#23 aren't built yet); a later call with the real token
// upserts in place per ADR-0004.
export const registerDeviceRequestSchema = z.object({
  device_id: z.string().uuid(),
  platform: devicePlatformSchema,
  push_token: z.string().min(1).nullable().optional(),
});

export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const deviceSchema = z.object({
  device_id: z.string().uuid(),
  platform: devicePlatformSchema,
  push_token: z.string().nullable(),
});

export type Device = z.infer<typeof deviceSchema>;

export const registerDeviceResponseSchema = envelopeSchema(deviceSchema);

export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
