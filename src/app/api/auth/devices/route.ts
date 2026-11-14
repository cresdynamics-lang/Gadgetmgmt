import { compare } from "bcryptjs";
import { recordFailure } from "@/lib/auth-security";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { signInAllowed } from "@/lib/sign-in-methods";
import { sameOrigin } from "@/lib/staff-alerts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in to view devices." }, 401);
  const devices = await prisma.authDevice.findMany({
    where: { ...(session.user.role === "OWNER" ? { OR: [{ userId: session.user.id }, { user: { role: { not: "OWNER" as const } } }] } : { userId: session.user.id }), revokedAt: null },
    select: { id: true, label: true, pinAllowed:true,passwordAllowed:true,biometricsAllowed:true,createdAt: true, lastUsedAt: true, user: { select: { name: true,role:true } }, _count: { select: { passkeys: true } } },
    orderBy: { lastUsedAt: "desc" },
  });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role:true,pinAllowed:true,passwordAllowed:true,biometricsAllowed: true } });
  const current=await prisma.authDevice.findFirst({where:{id:session.user.deviceId,userId:session.user.id,revokedAt:null},select:{pinUpdatedAt:true,pinAllowed:true,passwordAllowed:true,biometricsAllowed:true}});
  return json({canManageDevices:session.user.role==="OWNER",pinAllowed:Boolean(user&&current&&signInAllowed(user,current,"PIN")),passwordAllowed:Boolean(user&&current&&signInAllowed(user,current,"PASSWORD")),pinConfigured:Boolean(current?.pinUpdatedAt),devices, currentDeviceId: session.user.deviceId, biometricsAllowed: Boolean(user&&current&&signInAllowed(user,current,"BIOMETRIC")) });
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
    const device = await tx.authDevice.findFirst({ where: { id: input.data.id, ...(session.user.role === "OWNER" ? { OR: [{ userId: session.user.id }, { user: { role: { not: "OWNER" as const } } }] } : { userId: session.user.id }), revokedAt: null } });
    if (!device) return false;
    await tx.authDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await tx.authEvent.create({ data: { userId: session.user.id, action: "Device revoked", deviceLabel: device.label } });
    return true;
  });
  return result ? json({ ok: true }) : json({ error: "Device not found." }, 404);
}

export async function PATCH(request:Request) {
  if(!sameOrigin(request))return json({error:"Access denied."},403);
  const session=await auth();if(!session?.user)return json({error:"Sign in first."},401);
  if(session.user.role!=="OWNER")return json({error:"Only an Administrator can configure employee devices."},403);
  const input=z.object({id:z.string().cuid(),password:z.string().min(1).max(256),pinAllowed:z.boolean(),passwordAllowed:z.boolean(),biometricsAllowed:z.boolean()}).safeParse(await request.json().catch(()=>null));
  if(!input.success)return json({error:"Choose the device’s allowed sign-in methods and confirm your password."},400);
  const actor=await prisma.user.findUnique({where:{id:session.user.id}});
  if(!actor||!await compare(input.data.password,actor.passwordHash)){await recordFailure(session.user.id,"Device policy administration");return json({error:"Password could not be verified. Nothing changed."},401);}
  const {id,pinAllowed,passwordAllowed,biometricsAllowed}=input.data;const policy={pinAllowed,passwordAllowed,biometricsAllowed};
  const changed=await prisma.$transaction(async tx=>{
    const device=await tx.authDevice.findFirst({where:{id,revokedAt:null,user:{role:{not:"OWNER"}}}});if(!device)return false;
    await tx.authDevice.update({where:{id},data:policy});await tx.authEvent.create({data:{userId:session.user.id,action:"Updated employee device sign-in methods",deviceLabel:device.label}});return true;
  });
  return changed?json({ok:true}):json({error:"Employee device not found. Owner devices are protected."},404);
}
