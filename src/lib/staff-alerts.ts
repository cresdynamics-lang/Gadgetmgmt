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
  const allowedOrigin = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || request.url;
  try { return request.headers.get("origin") === new URL(allowedOrigin).origin; }
  catch { return false; }
}

export function alertDeliveryTime(input: { sendNow: boolean; scheduledAt?: string }, now = new Date()) {
  return input.sendNow || !input.scheduledAt ? now : new Date(input.scheduledAt);
}
