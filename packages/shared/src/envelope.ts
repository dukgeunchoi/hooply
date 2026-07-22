import { z } from "zod";

export const errorCodeSchema = z.enum(["bad_request", "not_found", "rate_limited", "internal"]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const metaSchema = z.object({
  generated_at: z.string().datetime(),
  delayed: z.boolean(),
  // Cursor-paginated endpoints only (docs/api-spec.md's "?cursor=&limit= ->
  // meta.next_cursor" convention) — absent entirely on every other route.
  next_cursor: z.string().nullable().optional(),
});

export type Meta = z.infer<typeof metaSchema>;

export function envelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: metaSchema,
  });
}

export type Envelope<T> = {
  data: T;
  meta: Meta;
};

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function makeEnvelope<T>(
  data: T,
  opts: { delayed?: boolean; next_cursor?: string | null } = {},
): Envelope<T> {
  return {
    data,
    meta: {
      generated_at: new Date().toISOString(),
      delayed: opts.delayed ?? false,
      ...(opts.next_cursor !== undefined ? { next_cursor: opts.next_cursor } : {}),
    },
  };
}

export function makeErrorEnvelope(code: ErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}
