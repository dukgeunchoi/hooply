import type { z } from "zod";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export async function apiGet<T extends z.ZodTypeAny>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}
