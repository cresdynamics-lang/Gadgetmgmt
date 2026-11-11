import { notificationApi } from "@/lib/notification-api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { canAccessPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";

const endpoint = z.url().max(2048).refine((value) => {
  const url = new URL(value);
  // Push endpoints are fetched by the worker. Restrict them to browser push services.
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
    ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns.windows.com", "notify.windows.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
});
const schema = z.object({ endpoint, keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) });

async function handle(request: Request, remove: boolean) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!sameOrigin(request) || !canAccessPage(session.user.role, "/notifications")) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (remove) {
    if (typeof input?.endpoint !== "string") return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
    await prisma.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint: input.endpoint } });
  } else {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: "Invalid browser subscription" }, { status: 400 });
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) return NextResponse.json({ error: "Browser push is not configured" }, { status: 503 });
    const data = { userId: session.user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth };
    await prisma.pushSubscription.upsert({ where: { endpoint: parsed.data.endpoint }, create: { endpoint: parsed.data.endpoint, ...data }, update: data });
  }
  return NextResponse.json({ ok: true });
}
export const POST = (request: Request) => notificationApi(() => handle(request, false));
export const DELETE = (request: Request) => notificationApi(() => handle(request, true));

export async function GET(request: Request) {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAccessPage(session.user.role, "/notifications")) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const value = new URL(request.url).searchParams.get("endpoint");
    const subscribed = value && endpoint.safeParse(value).success
      ? Boolean(await prisma.pushSubscription.findFirst({ where: { userId: session.user.id, endpoint: value }, select: { id: true } })) : false;
    const publicKey = process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null : null;
    return NextResponse.json({ subscribed: Boolean(subscribed), publicKey });
  });
}
