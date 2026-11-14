import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage, canUseCapability } from "@/lib/entitlements";
import { sameOrigin } from "@/lib/staff-alerts";
import { recordFailure } from "@/lib/auth-security";

export class CatalogAccessError extends Error{constructor(public status:number,message:string){super(message);}}
export async function catalogReader(){const session=await auth();if(!session?.user)throw new CatalogAccessError(401,"Sign in first.");const user=session.user;if(user.role==="OWNER")return user;
  const inventory=await canUseCapability(user.role,"inventory",user.id)&&(await canAccessPage(user.role,"/inventory",user.id)||await canAccessPage(user.role,"/devices",user.id));
  const sales=await canUseCapability(user.role,"sales",user.id)&&await canAccessPage(user.role,"/sales",user.id);
  if(!inventory&&!sales)throw new CatalogAccessError(403,"Your account cannot use catalog lookups.");return user;
}
export async function catalogOwner(request?:Request,password?:string){const session=await auth();if(!session?.user)throw new CatalogAccessError(401,"Sign in first.");if(session.user.role!=="OWNER")throw new CatalogAccessError(403,"Only an Owner can manage catalog discovery.");if(request){if(!sameOrigin(request))throw new CatalogAccessError(403,"Open this action from GadgetHub.");const actor=await prisma.user.findUnique({where:{id:session.user.id},select:{passwordHash:true}});if(!password||!actor||!await compare(password,actor.passwordHash)){if(password)await recordFailure(session.user.id,"Catalog source administration");throw new CatalogAccessError(401,"Confirm your current password before changing discovery settings.");}}return session.user;}
export const catalogJson=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export function catalogFailure(error:unknown){return error instanceof CatalogAccessError?catalogJson({error:error.message},error.status):catalogJson({error:"The reference catalog is unavailable. Existing shop stock is unaffected."},503);}
