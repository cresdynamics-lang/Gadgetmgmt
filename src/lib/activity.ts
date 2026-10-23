import { prisma } from "@/lib/prisma";

export type ActivityAction =
  | "LOGIN"
  | "LOGOUT"
  | "SALE_CREATED"
  | "TRADE_IN_ACCEPTED"
  | "STOCK_RECEIVED"
  | "PRODUCT_CREATED"
  | "CREDIT_PAYMENT"
  | "STAFF_CREATED"
  | "POLICY_UPDATED"
  | "PERMISSIONS_UPDATED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "SALES_GOAL_UPDATED"
  | "TRADE_IN_STOCKED"
  | "MPESA_PROMPT_SENT";

export async function startUserSession(userId: string) {
  const session = await prisma.userSession.create({ data: { userId }, select: { id: true } });
  await recordActivity({
    userId,
    sessionId: session.id,
    action: "LOGIN",
    summary: "Signed in",
  });
  return session.id;
}

export async function touchUserSession(sessionId: string) {
  await prisma.userSession.updateMany({
    where: { id: sessionId, endedAt: null },
    data: { lastSeenAt: new Date() },
  });
}

export async function endUserSession(sessionId: string) {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, startedAt: true, endedAt: true },
  });
  if (!session || session.endedAt) return;
  const endedAt = new Date();
  await prisma.userSession.update({ where: { id: session.id }, data: { endedAt, lastSeenAt: endedAt } });
  await recordActivity({
    userId: session.userId,
    sessionId: session.id,
    action: "LOGOUT",
    summary: `Signed out after ${formatDuration(endedAt.getTime() - session.startedAt.getTime())}`,
  });
}

export async function recordActivity(input: {
  userId?: string | null;
  sessionId?: string | null;
  action: ActivityAction;
  summary: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    await prisma.activityEvent.create({
      data: {
        userId: input.userId || null,
        sessionId: input.sessionId || null,
        action: input.action,
        summary: input.summary,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  } catch (error) {
    console.error("Activity could not be recorded", error);
  }
}

export function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  if (totalMinutes < 1) return "under a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
