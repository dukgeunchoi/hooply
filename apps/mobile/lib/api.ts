import type { z } from "zod";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// Carries the HTTP status so callers (see lib/polling.ts) can tell a
// transient failure (429/5xx, worth retrying) from a client-side bug
// (other 4xx, retrying won't help).
export class ApiError extends Error {
  constructor(
    public status: number,
    statusText: string,
  ) {
    super(`API request failed: ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

export async function apiGet<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return schema.parse(await res.json());
}

async function apiSend<T extends z.ZodTypeAny>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  schema: T,
): Promise<z.infer<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return schema.parse(await res.json());
}

export function apiPost<T extends z.ZodTypeAny>(
  path: string,
  body: unknown,
  schema: T,
): Promise<z.infer<T>> {
  return apiSend("POST", path, body, schema);
}

export function apiPut<T extends z.ZodTypeAny>(
  path: string,
  body: unknown,
  schema: T,
): Promise<z.infer<T>> {
  return apiSend("PUT", path, body, schema);
}
