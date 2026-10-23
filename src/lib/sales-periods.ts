// Nairobi is UTC+3 all year (no daylight saving), so day arithmetic in fixed 24h steps is safe.
const DAY_MS = 24 * 60 * 60 * 1000;
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

export type SalesRange = "today" | "week" | "month" | "custom";

export function nairobiDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function nairobiMidnight(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+03:00`);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function startOfNairobiDay(date: Date) {
  return nairobiMidnight(nairobiDateKey(date));
}

/** Weeks run Monday to Sunday. */
export function startOfNairobiWeek(date: Date) {
  const day = startOfNairobiDay(date);
  const weekday = new Date(day.getTime() + NAIROBI_OFFSET_MS).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function startOfNairobiMonth(date: Date) {
  return nairobiMidnight(`${nairobiDateKey(date).slice(0, 8)}01`);
}

export function startOfNextNairobiMonth(date: Date) {
  const [year, month] = nairobiDateKey(date).split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return nairobiMidnight(next.toISOString().slice(0, 10));
}

export function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(nairobiMidnight(value).getTime()));
}

/** Resolve a report range to [start, end). Custom ranges include the whole `to` day. */
export function resolveSalesRange(range: SalesRange, now: Date, from?: string | null, to?: string | null) {
  if (range === "custom" && isDateKey(from) && isDateKey(to)) {
    const start = nairobiMidnight(from <= to ? from : to);
    const end = addDays(nairobiMidnight(from <= to ? to : from), 1);
    return { start, end };
  }
  if (range === "week") return { start: startOfNairobiWeek(now), end: addDays(startOfNairobiWeek(now), 7) };
  if (range === "month") return { start: startOfNairobiMonth(now), end: startOfNextNairobiMonth(now) };
  const start = startOfNairobiDay(now);
  return { start, end: addDays(start, 1) };
}

export function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}
