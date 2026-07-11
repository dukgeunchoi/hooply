export function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isSameDate(a: Date, b: Date): boolean {
  return toDateParam(a) === toDateParam(b);
}

export function formatStripDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

export function formatStripDate(date: Date): string {
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatTipoff(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
