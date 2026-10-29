export const KENYA_TIME_ZONE = "Africa/Nairobi";

export function kenyaDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${date.toLocaleString("en-KE", {
    timeZone: KENYA_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })} EAT`;
}
