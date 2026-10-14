export type AutomatedCreditStatus = "ACTIVE" | "DUE_SOON" | "DUE" | "GRACE" | "LATE_1" | "LATE_2" | "LATE_3" | "RECOVERY";

export function nairobiDay(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function daysUntilDue(dueDate: Date, now: Date) {
  return Math.round((Date.parse(`${nairobiDay(dueDate)}T00:00:00Z`) - Date.parse(`${nairobiDay(now)}T00:00:00Z`)) / 86_400_000);
}

export function creditStatusForDays(days: number, graceDays: number): AutomatedCreditStatus {
  if (days > 3) return "ACTIVE";
  if (days > 0) return "DUE_SOON";
  if (days === 0) return "DUE";
  const overdueDays = -days;
  if (overdueDays <= graceDays) return "GRACE";
  const lateDays = overdueDays - graceDays;
  if (lateDays <= 3) return "LATE_1";
  if (lateDays <= 6) return "LATE_2";
  if (lateDays < 14) return "LATE_3";
  return "RECOVERY";
}
