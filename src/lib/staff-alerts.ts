import { z } from "zod";

export const alertInput = z.object({
  requestId: z.uuid().optional(),
  userId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  sendNow: z.boolean().default(false),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  email: z.boolean().default(false),
  push: z.boolean().default(false),
});

// Cookie-authenticated mutations must originate from this app.
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  const canonical = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || process.env.AUTH_URL || request.url;
  const allowed = [canonical, ...(process.env.NOTIFICATION_ALLOWED_ORIGINS || "").split(",")];
  return allowed.some((value) => {
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.origin === origin;
    } catch { return false; }
  });
}

export function alertDeliveryTime(input: { sendNow: boolean; scheduledAt?: string }, now = new Date()) {
  return input.sendNow || !input.scheduledAt ? now : new Date(input.scheduledAt);
}
