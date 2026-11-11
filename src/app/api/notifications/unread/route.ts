import { auth } from "@/auth";
import { canAccessPage } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { notificationApi } from "@/lib/notification-api";

export async function GET(request: Request) {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (!(await canAccessPage(session.user.role, "/notifications"))) return Response.json({ error: "Access denied" }, { status: 403 });
    const where = { userId: session.user.id, scheduledAt: { lte: new Date() } };
    const [unread, alerts] = await Promise.all([
      prisma.staffAlert.count({ where: { ...where, readAt: null } }),
      prisma.staffAlert.findMany({ where, orderBy: { scheduledAt: "desc" }, take: 5, select: { id: true, title: true, body: true, scheduledAt: true, readAt: true } }),
    ]);
    return Response.json({ unread, alerts });
  }, request);
}
