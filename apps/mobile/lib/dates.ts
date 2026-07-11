// Uses the device's local calendar day, not UTC — toISOString() would
// mislabel "Today" for anyone west of UTC during their evening/night, when
// the UTC calendar date has already rolled over to tomorrow.
export function toDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
