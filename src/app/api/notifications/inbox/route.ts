import { limitNotificationAction, readNotificationJson } from "@/lib/notification-security";
import { getCompanyEmailSettings } from "@/lib/email-settings";
import { notificationApi } from "@/lib/notification-api";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessPage, canUseCapability } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { enqueueImmediateDeliveries } from "@/lib/notification-queue";
import { alertDeliveryTime, alertInput, sameOrigin } from "@/lib/staff-alerts";

async function handleGET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await canAccessPage(session.user.role, "/notifications"))) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const where = { userId: session.user.id, scheduledAt: { lte: new Date() } };
  const canManage = (await canUseCapability(session.user.role, "notifications"));
  const [alerts, unread, recipients, sent, heartbeat, email] = await Promise.all([
    prisma.staffAlert.findMany({ where, orderBy: { scheduledAt: "desc" }, take: 100, include: { deliveries: { select: { channel: true, status: true } } } }),
    prisma.staffAlert.count({ where: { ...where, readAt: null } }),
    canManage ? prisma.user.findMany({ where: { status: "ACTIVE", ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    canManage ? prisma.staffAlert.findMany({ where: { senderId: session.user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } }, deliveries: { select: { channel: true, status: true, attempts: true, lastError: true } } } }) : Promise.resolve([]),
    prisma.scheduledJobRun.findUnique({ where: { id: "staff-notifications-heartbeat" }, select: { finishedAt: true } }),
    getCompanyEmailSettings(),
  ]);
  return NextResponse.json({ alerts, unread, recipients, sent, canManage,
    canConfigureEmail: (await canUseCapability(session.user.role, "companyEmailSettings")),
    emailConfigured: email.configured,
    emailTestMode: email.testMode,
    workerOnline: Boolean(heartbeat?.finishedAt && Date.now() - heartbeat.finishedAt.getTime() < 90_000),
    pushPublicKey: process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null : null,
  });
}

async function handlePOST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!(await canAccessPage(session.user.role, "/notifications")) || !(await canUseCapability(session.user.role, "notifications"))) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  await limitNotificationAction(session.user.id, "send", 30);
  const parsed = alertInput.safeParse(await readNotificationJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Enter a recipient, title, message and valid schedule." }, { status: 400 });
  const input = parsed.data;
  const recipient = await prisma.user.findFirst({ where: { id: input.userId, status: "ACTIVE", ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) } });
  if (!recipient) return NextResponse.json({ error: "Recipient not available in your branch." }, { status: 404 });
  const scheduledAt = alertDeliveryTime(input);
  // Persist the inbox message independently; optional channels fail/retry on their own delivery rows.
  const data = {
    userId: recipient.id, senderId: session.user.id, title: input.title, body: input.body,
    scheduledAt,
    deliveries: { create: [ ...(input.email ? [{ channel: "EMAIL" }] : []), ...(input.push ? [{ channel: "PUSH" }] : []) ] },
  };
  const include = { deliveries: { select: { id: true } } };
  const alert = input.requestId
    ? await prisma.staffAlert.upsert({ where: { requestKey: `${session.user.id}:${input.requestId}` }, create: { ...data, requestKey: `${session.user.id}:${input.requestId}` }, update: {}, include })
    : await prisma.staffAlert.create({ data, include });
  let deliveryPending = false;
  if (alert.scheduledAt <= new Date() && alert.deliveries.length) {
    try { await enqueueImmediateDeliveries(alert.deliveries.map((delivery) => delivery.id)); }
    catch { deliveryPending = true; }
  }
  return NextResponse.json({ id: alert.id, deliveryPending }, { status: 201 });
}

async function handlePATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!sameOrigin(request) || !(await canAccessPage(session.user.role, "/notifications"))) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  const input = await readNotificationJson(request);
  if (!input || typeof input !== "object" || !("id" in input) || typeof input.id !== "string" || input.id.length > 128) return NextResponse.json({ error: "Alert ID required" }, { status: 400 });
  await prisma.staffAlert.updateMany({ where: { id: input.id, userId: session.user.id, scheduledAt: { lte: new Date() }, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) { return notificationApi(() => handleGET(), request); }

export async function POST(request: Request) { return notificationApi(() => handlePOST(request), request); }

export async function PATCH(request: Request) { return notificationApi(() => handlePATCH(request), request); }
