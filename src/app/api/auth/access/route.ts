import { compare } from "bcryptjs";
import { recordFailure } from "@/lib/auth-security";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";
import { applyPageFloors, normalizeCapabilities, normalizePages, isAppRole } from "@/lib/access";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in first." }, 401);
  if (session.user.role !== "OWNER") return json({ error: "Only the Administrator can manage access." }, 403);
  return json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, status: true, accessExpiresAt: true, accessPages: true, accessCapabilities: true, pinAllowed:true,passwordAllowed:true,biometricsAllowed: true, lockedAt: true }, orderBy: { name: "asc" } }));
}
const schema = z.object({ expiresAt: z.iso.datetime().nullable().optional(), password: z.string().min(1).max(256), userId: z.string().cuid(), pages: z.array(z.string()).max(30), capabilities: z.array(z.string()).max(20), pinAllowed:z.boolean().optional(),passwordAllowed:z.boolean().optional(),biometricsAllowed: z.boolean(), unlock: z.boolean().default(false) });
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Access denied." }, 403);
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in first." }, 401);
  if (session.user.role !== "OWNER") return json({ error: "Only the Administrator can manage access." }, 403);
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: "Check the selected permissions." }, 400);
  const actor = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!actor || !await compare(input.data.password, actor.passwordHash)) {
    await recordFailure(session.user.id, "Security administration");
    return json({ error: "Password could not be verified. Changes were not applied." }, 401);
  }
  if (input.data.expiresAt && new Date(input.data.expiresAt) <= new Date()) return json({ error: "Access expiry must be in the future." }, 400);
  const user = await prisma.user.findUnique({ where: { id: input.data.userId } });
  if (!user || !isAppRole(user.role)) return json({ error: "Account not found." }, 404);
  if (user.role === "OWNER") return json({ error: "Owner access is protected and cannot be changed through staff permissions." }, 403);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { accessExpiresAt: input.data.expiresAt === undefined ? undefined : input.data.expiresAt ? new Date(input.data.expiresAt) : null, accessPages: applyPageFloors(user.role, normalizePages(input.data.pages)), accessCapabilities: normalizeCapabilities(input.data.capabilities), pinAllowed:input.data.pinAllowed,passwordAllowed:input.data.passwordAllowed,biometricsAllowed: input.data.biometricsAllowed, ...(input.data.unlock ? { lockedAt: null, failedSignIns: 0 } : {}) } }),
    prisma.authEvent.create({ data: { userId: session.user.id, action: `${input.data.unlock ? "Unlocked account and updated" : "Updated"} access for ${user.name}`, deviceLabel: "Access administration" } }),
  ]);
  return json({ ok: true });
}
