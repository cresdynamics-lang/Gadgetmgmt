export const WEBSITE_LIVE_KEY = "website_live_snapshot";
export const WEBSITE_LIVE_STALE_MS = 120_000;

export function parseWebsiteLiveSnapshot(raw: string) {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function websiteLiveStale(snapshot: Record<string, unknown> | null, now = Date.now()) {
  const updated = Date.parse(String(snapshot?.updatedAt ?? ""));
  return !Number.isFinite(updated) || now - updated > WEBSITE_LIVE_STALE_MS;
}
