import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";
import { hasAnyQuery } from "@/lib/access";
import { accountPasswordSchema } from "@/lib/account-password";
import { emailAccountPassword } from "@/lib/account-email";
import { recordFailure } from "@/lib/auth-security";

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
const schema=z.object({password:accountPasswordSchema,actorPassword:z.string().min(1).max(256),emailCredentials:z.boolean().default(false)});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!sameOrigin(request)||hasAnyQuery(request.url))return json({error:"Access denied."},403);
  const session=await auth();if(!session?.user)return json({error:"Sign in first."},401);
  if(session.user.role!=="OWNER")return json({error:"Only an Administrator can reset employee passwords."},403);
  const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return json({error:"Enter a new password of 12–72 characters and confirm your current password."},400);
  const {id}=await params;
  const target=await prisma.user.findUnique({where:{id},select:{role:true}});
  if(!target)return json({error:"Account not found."},404);
  if(target.role==="OWNER")return json({error:"Owner passwords cannot be reset by another account. Use verified server recovery."},403);
  const actor=await prisma.user.findUnique({where:{id:session.user.id}});
  if(!actor||!await compare(input.data.actorPassword,actor.passwordHash)){await recordFailure(session.user.id,"Password administration");return json({error:"Your current password could not be verified. Nothing changed."},401);}
  const passwordHash=await hash(input.data.password,12);
  try {
    const result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} FOR UPDATE`;
      const user=await tx.user.findUnique({where:{id}});if(!user||user.role==="OWNER")return null;
      await tx.user.update({where:{id},data:{passwordHash,lockedAt:null,failedSignIns:0}});
      await tx.authDevice.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.authChallenge.deleteMany({where:{userId:id}});
      const event=await tx.authEvent.create({data:{userId:session.user.id,action:`Reset password for ${user.email}`,deviceLabel:"Password administration"}});
      return {id:user.id,name:user.name,email:user.email,eventId:event.id};
    });
    if(!result)return json({error:"This account cannot be reset. Refresh and try again."},409);
    const emailStatus=input.data.emailCredentials?await emailAccountPassword({...result,password:input.data.password,reset:true}):"not_requested";
    return json({ok:true,emailStatus});
  } catch {return json({error:"Password reset could not be confirmed. Refresh before retrying."},503);}
}
