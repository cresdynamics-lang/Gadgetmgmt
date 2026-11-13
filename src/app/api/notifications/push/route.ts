import { pushEndpoint as endpoint } from "@/lib/push-endpoint";
import { limitNotificationAction, readNotificationJson } from "@/lib/notification-security";
import { notificationApi } from "@/lib/notification-api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { canAccessPage } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";

const schema = z.object({ endpoint, keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) });

async function handle(request: Request, remove: boolean) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!sameOrigin(request) || !(await canAccessPage(session.user.role, "/notifications", session.user.id))) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  await limitNotificationAction(session.user.id, "push-subscription", 30);
  const input = await readNotificationJson(request);
  if (remove) {
    if (!input || typeof input !== "object" || !("endpoint" in input) || typeof input.endpoint !== "string" || input.endpoint.length > 2048) return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
    await prisma.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint: input.endpoint } });
  } else {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: "Invalid browser subscription" }, { status: 400 });
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) return NextResponse.json({ error: "Browser push is not configured" }, { status: 503 });
    const data = { userId: session.user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth };
    const saved = await prisma.pushSubscription.findUnique({ where: { endpoint: parsed.data.endpoint }, select: { userId: true } });
    if (saved && saved.userId !== session.user.id) return NextResponse.json({ error: "This browser subscription belongs to another account. Reset browser notifications before enabling them." }, { status: 409 });
    if (saved) await prisma.pushSubscription.updateMany({ where: { endpoint: parsed.data.endpoint, userId: session.user.id }, data });
    else await prisma.pushSubscription.create({ data: { endpoint: parsed.data.endpoint, ...data } });
  }
  return NextResponse.json({ ok: true });
}
export const POST = (request: Request) => notificationApi(() => handle(request, false), request);
export const DELETE = (request: Request) => notificationApi(() => handle(request, true), request);

export async function GET(request: Request) {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!(await canAccessPage(session.user.role, "/notifications", session.user.id))) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const value = new URL(request.url).searchParams.get("endpoint");
    const subscribed = value && endpoint.safeParse(value).success
      ? Boolean(await prisma.pushSubscription.findFirst({ where: { userId: session.user.id, endpoint: value }, select: { id: true } })) : false;
    const publicKey = process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null : null;
    return NextResponse.json({ subscribed: Boolean(subscribed), publicKey });
  }, request);
}
