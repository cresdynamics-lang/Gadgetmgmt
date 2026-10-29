import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { formatDuration, sessionPresence } from "@/lib/activity";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "activity.view")) {
    return denied(session.user, "activity.view", "Only a super admin can view activity.");
  }

  const [events, sessions] = await Promise.all([
    prisma.activityEvent.findMany({
      take: 250,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true, role: true } },
        session: { select: { startedAt: true, lastSeenAt: true, endedAt: true } },
      },
    }),
    prisma.userSession.findMany({
      take: 80,
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { name: true, email: true, role: true } },
        _count: { select: { events: true } },
      },
    }),
  ]);

  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      summary: event.summary,
      entityType: event.entityType,
      entityId: event.entityId,
      createdAt: event.createdAt,
      user: event.user,
      sessionDuration: event.session
        ? formatDuration((event.session.endedAt ?? event.session.lastSeenAt).getTime() - event.session.startedAt.getTime())
        : null,
    })),
    sessions: sessions.map((item) => {
      const presence = sessionPresence(item.endedAt, item.lastSeenAt);
      const closedAt = item.endedAt ?? item.lastSeenAt;
      return {
        id: item.id,
        startedAt: item.startedAt,
        lastSeenAt: item.lastSeenAt,
        endedAt: item.endedAt,
        duration: formatDuration(closedAt.getTime() - item.startedAt.getTime()),
        active: presence === "live",
        presence,
        eventCount: item._count.events,
        user: item.user,
      };
    }),
  });
}
