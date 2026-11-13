import { Prisma } from "@prisma/client";
import { compare } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage, canUseCapability } from "@/lib/entitlements";
import { recordFailure } from "@/lib/auth-security";
import { sameOrigin } from "@/lib/staff-alerts";
import { operationCreate, operationUpdate, operationPages, operationCapabilities, OPERATION_KINDS, presentOperation, type OperationKind } from "@/lib/operations";
import { createOperation, updateOperation, operationInclude, operationFailure } from "@/lib/operation-store";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function authorized(kind:OperationKind) {
  const session=await auth();
  if(!session?.user)return null;
  return await canAccessPage(session.user.role,operationPages[kind],session.user.id) && await canUseCapability(session.user.role,operationCapabilities[kind],session.user.id) ? session.user : null;
}
export async function GET(request:Request) {
  const kind=new URL(request.url).searchParams.get("kind") as OperationKind;
  if(!OPERATION_KINDS.includes(kind))return json({error:"Choose an operation type."},400);
  const actor=await authorized(kind); if(!actor)return json({error:"This workflow is not available for your account."},403);
  const branch={branchId:actor.branchId??""};
  const records=await prisma.operation.findMany({where:{kind,...(actor.role==="OWNER"?{}:branch)},include:operationInclude,orderBy:[{closedAt:{sort:"asc",nulls:"first"}},{dueAt:"asc"}],take:200});
  const [units,products,sales]=await Promise.all([
    prisma.stockUnit.findMany({where:branch,select:{id:true,imei:true,serialNumber:true,status:true,saleItem:{select:{saleId:true}},product:{select:{name:true,sku:true}}},orderBy:{updatedAt:"desc"},take:500}),
    prisma.product.findMany({where:branch,select:{id:true,name:true,sku:true},orderBy:{name:"asc"},take:500}),
    kind==="DELIVERY"?prisma.sale.findMany({where:{...branch,status:{not:"VOIDED"}},select:{id:true,invoiceNumber:true,total:true,paidAmount:true},orderBy:{createdAt:"desc"},take:100}):[],
  ]);
  return json({records:records.map(row=>presentOperation(row,actor.role==="OWNER")),units,products,sales,owner:actor.role==="OWNER",canWriteCosts:await canUseCapability(actor.role,"costEntry",actor.id)});
}
export async function POST(request:Request) {
  if(!sameOrigin(request))return json({error:"Open this workflow from GadgetHub."},403);
  const input=operationCreate.safeParse(await request.json().catch(()=>null));
  if(!input.success)return json({error:input.error.issues[0]?.message??"Check the required details."},400);
  const actor=await authorized(input.data.kind);if(!actor)return json({error:"Access denied."},403);
  try {
    const record=await prisma.$transaction(tx=>createOperation(tx,input.data,actor),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return json(presentOperation(record,actor.role==="OWNER"),201);
  }catch(error){const failure=operationFailure(error);return json({error:failure.error},failure.status);}
}
export async function PATCH(request:Request) {
  if(!sameOrigin(request))return json({error:"Access denied."},403);
  const input=operationUpdate.safeParse(await request.json().catch(()=>null));
  if(!input.success)return json({error:input.error.issues[0]?.message??"Check the action details."},400);
  const session=await auth();if(!session?.user)return json({error:"Sign in first."},401);
  const record=await prisma.operation.findFirst({where:{id:input.data.id,...(session.user.role==="OWNER"?{}:{branchId:session.user.branchId??""})}});
  if(!record)return json({error:"Operation not found."},404);
  const actor=await authorized(record.kind);if(!actor)return json({error:"Access denied."},403);
  if(actor.role==="OWNER" && (input.data.costAmount!==undefined || ["SETTLE","VALUE"].includes(input.data.action) || (["TRADE_IN","RETURN"].includes(record.kind)&&input.data.action==="ACCEPT"))) {
    const user=await prisma.user.findUnique({where:{id:actor.id},select:{passwordHash:true}});
    if(!input.data.password || !user || !await compare(input.data.password,user.passwordHash)) {await recordFailure(actor.id,"Operations approval");return json({error:"Confirm your password before approving this financial action."},401);}
  }
  try {
    const costs=await canUseCapability(actor.role,"costEntry",actor.id);
    const updated=await prisma.$transaction(tx=>updateOperation(tx,input.data,actor,costs),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return json(presentOperation(updated,actor.role==="OWNER"));
  }catch(error){const failure=operationFailure(error);return json({error:failure.error},failure.status);}
}
