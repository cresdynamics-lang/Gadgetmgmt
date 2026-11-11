import { prisma } from "./prisma";

export class NotificationRequestError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

// PostgreSQL provides a shared atomic counter without depending on the delivery worker/Redis.
export async function limitNotificationAction(userId: string, action: string, limit: number) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 60_000) * 60_000);
  const key = `${action}:${userId}`;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "NotificationRateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "NotificationRateLimit"."windowStart" = EXCLUDED."windowStart"
        THEN "NotificationRateLimit"."count" + 1 ELSE 1 END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING "count"`;
  if (!rows.length || rows[0].count > limit) throw new NotificationRequestError(429, "Too many notification requests. Please wait a minute and try again.", Math.ceil((windowStart.getTime() + 60_000 - now) / 1000));
}

export async function readNotificationJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json")) throw new NotificationRequestError(415, "Send notification requests as JSON.");
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new NotificationRequestError(413, "Notification request is too large.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { return null; }
}
