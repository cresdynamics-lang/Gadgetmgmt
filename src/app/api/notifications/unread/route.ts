import { auth } from "@/auth";
import { canAccessPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { notificationApi } from "@/lib/notification-api";

export async function GET() {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (!canAccessPage(session.user.role, "/notifications")) return Response.json({ error: "Access denied" }, { status: 403 });
    const unread = await prisma.staffAlert.count({ where: { userId: session.user.id, readAt: null, scheduledAt: { lte: new Date() } } });
    return Response.json({ unread });
  });
}
