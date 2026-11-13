import { compare } from "bcryptjs";
import { recordFailure } from "@/lib/auth-security";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in to view devices." }, 401);
  const devices = await prisma.authDevice.findMany({
    where: { ...(session.user.role === "OWNER" ? {} : { userId: session.user.id }), revokedAt: null },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, user: { select: { name: true } }, _count: { select: { passkeys: true } } },
    orderBy: { lastUsedAt: "desc" },
  });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { biometricsAllowed: true } });
  return json({ devices, currentDeviceId: session.user.deviceId, biometricsAllowed: session.user.role === "OWNER" || user?.biometricsAllowed });
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Access denied." }, 403);
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in to revoke a device." }, 401);
  const input = z.object({ id: z.string().cuid(), password: z.string().min(1).max(256) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: "Choose a device." }, 400);
  const actor = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!actor || !await compare(input.data.password, actor.passwordHash)) {
    await recordFailure(session.user.id, "Security administration");
    return json({ error: "Password could not be verified. Changes were not applied." }, 401);
  }
  const result = await prisma.$transaction(async tx => {
    const device = await tx.authDevice.findFirst({ where: { id: input.data.id, ...(session.user.role === "OWNER" ? {} : { userId: session.user.id }), revokedAt: null } });
    if (!device) return false;
    await tx.authDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await tx.authEvent.create({ data: { userId: session.user.id, action: "Device revoked", deviceLabel: device.label } });
    return true;
  });
  return result ? json({ ok: true }) : json({ error: "Device not found." }, 404);
}
