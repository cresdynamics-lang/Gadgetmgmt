import { limitNotificationAction, readNotificationJson } from "@/lib/notification-security";
import { z } from "zod";
import { auth } from "@/auth";
import { canAccessPage } from "@/lib/entitlements";
import { notificationApi } from "@/lib/notification-api";
import { enqueueImmediateDeliveries } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";

export async function POST(request: Request) {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (!sameOrigin(request) || !(await canAccessPage(session.user.role, "/notifications", session.user.id))) return Response.json({ error: "Access denied" }, { status: 403 });
    await limitNotificationAction(session.user.id, "push-test", 5);
    const input = z.object({ requestId: z.uuid() }).safeParse(await readNotificationJson(request));
    if (!input.success) return Response.json({ error: "A valid test request is required." }, { status: 400 });
    if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_SUBJECT) return Response.json({ error: "Browser push needs server setup." }, { status: 503 });
    if (!await prisma.pushSubscription.count({ where: { userId: session.user.id } })) return Response.json({ error: "Enable browser notifications on this device first." }, { status: 400 });
    const alert = await prisma.staffAlert.upsert({ where: { requestKey: `push-test:${session.user.id}:${input.data.requestId}` }, update: {}, create: {
      requestKey: `push-test:${session.user.id}:${input.data.requestId}`, userId: session.user.id, senderId: session.user.id,
      title: "Browser notification test", body: "Your in-app notifications are working. Browser delivery sends this test to your subscribed devices.", deliveries: { create: { channel: "PUSH" } },
    }, include: { deliveries: { select: { id: true } } } });
    let deliveryPending = false;
    try { await enqueueImmediateDeliveries(alert.deliveries.map((delivery) => delivery.id)); } catch { deliveryPending = true; }
    return Response.json({ id: alert.id, deliveryPending }, { status: 201 });
  }, request);
}
