import { auth } from "@/auth";
import { foregroundLeaseUntil } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });
  const updated = await prisma.authDevice.updateMany({ where: { id: session.user.deviceId, userId: session.user.id, revokedAt: null, lockedAt: null, activeUntil: { gt: new Date() } }, data: { activeUntil: foregroundLeaseUntil() } });
  return new Response(null, { status: updated.count ? 204 : 401, headers: { "Cache-Control": "no-store" } });
}
