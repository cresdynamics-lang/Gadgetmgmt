import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage } from "@/lib/entitlements";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await auth();
  if(!session?.user)return Response.json({error:"Sign in first."},{status:401});
  if(!await canAccessPage(session.user.role,"/devices",session.user.id))return Response.json({error:"Access denied."},{status:403});
  const {id}=await params;
  const unit=await prisma.stockUnit.findFirst({where:{id,...(session.user.role==="OWNER"?{}:{branchId:session.user.branchId??""})},include:{product:{select:{name:true,sku:true,sellingPrice:true}},events:{orderBy:{createdAt:"desc"},include:{user:{select:{name:true}}}},operations:{select:{id:true,kind:true,status:true,party:true,dueAt:true,closedAt:true}}}});
  if(!unit)return Response.json({error:"Device not found."},{status:404});
  return Response.json({...unit,events:unit.events.map(({amount,requestHash,requestKey,...event})=>{void requestHash;void requestKey;return session.user.role==="OWNER"?{...event,amount}:event;})},{headers:{"Cache-Control":"no-store"}});
}
