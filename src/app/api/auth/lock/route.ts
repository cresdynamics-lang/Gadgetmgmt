import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });
  await prisma.authDevice.updateMany({ where: { id: session.user.deviceId, userId: session.user.id, revokedAt: null }, data: { lockedAt: new Date() } });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
