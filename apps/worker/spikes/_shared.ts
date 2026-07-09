// Shared helpers for one-off provider spike scripts (see docs/provider-decision.md).
// Not production ingestion code — normalization logic must not be copied out of here as-is.

export function loadEnv(): void {
  process.loadEnvFile(new URL("../.env", import.meta.url));
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in apps/worker/.env (see .env.example)`);
  }
  return value;
}

export function section(title: string): void {
  console.log(`\n${"=".repeat(3)} ${title} ${"=".repeat(3)}`);
}

export function report(label: string, value: unknown): void {
  console.log(`${label}:`, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

export async function getJson<T = unknown>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
