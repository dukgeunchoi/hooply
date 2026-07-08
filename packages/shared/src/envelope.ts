import { z } from "zod";

export const errorCodeSchema = z.enum(["bad_request", "not_found", "rate_limited", "internal"]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const metaSchema = z.object({
  generated_at: z.string().datetime(),
  delayed: z.boolean(),
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

export function makeEnvelope<T>(data: T, opts: { delayed?: boolean } = {}): Envelope<T> {
  return {
    data,
    meta: {
      generated_at: new Date().toISOString(),
      delayed: opts.delayed ?? false,
    },
  };
}

export function makeErrorEnvelope(code: ErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}
