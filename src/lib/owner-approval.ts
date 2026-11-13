import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";
import { recordFailure } from "@/lib/auth-security";
import { OperationError } from "@/lib/operations";
export async function requireOwner(request?:Request,password?:string) {
  if(request && !sameOrigin(request))throw new OperationError(403,"Open this action from GadgetHub.");
  const session=await auth();
  if(!session?.user)throw new OperationError(401,"Sign in first.");
  if(session.user.role!=="OWNER")throw new OperationError(403,"Only Victor can access financial records.");
  if(request) {
    const user=await prisma.user.findUnique({where:{id:session.user.id},select:{passwordHash:true}});
    if(!password || !user || !await compare(password,user.passwordHash)) {await recordFailure(session.user.id,"Financial approval");throw new OperationError(401,"Confirm your password before changing or exporting financial records.");}
  }
  return session.user;
}
