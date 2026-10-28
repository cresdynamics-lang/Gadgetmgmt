import { timingSafeEqual } from "node:crypto";

export function websiteSyncSecret() {
  return process.env.WEBSITE_SYNC_SECRET?.trim() || "";
}

function readBearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return request.headers.get("x-website-sync-secret")?.trim() || "";
}

export function assertWebsiteSync(request: Request) {
  const expected = websiteSyncSecret();
  if (!expected) {
    return { ok: false as const, status: 503, error: "Website sync is not configured on this server." };
  }
  const provided = readBearer(request);
  if (!provided) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }
  return { ok: true as const };
}
