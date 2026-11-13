import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage,canUseCapability } from "@/lib/entitlements";
import { requireOwner } from "@/lib/owner-approval";
import { operationFailure } from "@/lib/operation-store";
import { tracksUnits } from "@/lib/device-units";
import { variantIdentity,restockAdvice } from "@/lib/variant-planning";
export async function GET() {
  const session=await auth();if(!session?.user)return Response.json({error:"Sign in first."},{status:401});
  const actor=session.user;
  if(!await canAccessPage(actor.role,"/planner",actor.id)||!await canUseCapability(actor.role,"inventory",actor.id))return Response.json({error:"Access denied."},{status:403});
  const scope=actor.role==="OWNER"?{}:{branchId:actor.branchId??""};
  const [units,events,targets,inventory,salesByProduct]=await Promise.all([
    prisma.stockUnit.findMany({where:scope,select:{id:true,productId:true,color:true,storage:true,status:true,product:{select:{name:true,sku:true}}}}),
    prisma.deviceEvent.findMany({where:{...scope,kind:{in:["Device sold","Sale settled","PARTNER SETTLE"]},createdAt:{gte:new Date(Date.now()-30*86400000)}},select:{unitId:true,saleId:true}}),
    prisma.variantTarget.findMany({where:{product:scope}}),
    prisma.inventoryItem.findMany({where:scope,include:{product:{select:{id:true,name:true,sku:true,category:true,unitTracking:true,reorderLevel:true}}}}),
    prisma.saleItem.groupBy({by:["productId"],where:{sale:{...scope,status:{in:["PAID","PARTIAL"]},createdAt:{gte:new Date(Date.now()-30*86400000)}}},_sum:{quantity:true}}),
  ]);
  const sales=new Map<string,number>();const seen=new Set<string>();
  for(const event of events){const key=`${event.unitId}:${event.saleId}`;if(!seen.has(key)){sales.set(event.unitId,(sales.get(event.unitId)??0)+1);seen.add(key);}}
  const variants=new Map<string,{productId:string;name:string;sku:string;color:string;storage:string;available:number;reserved:number;sold:number}>();
  for(const unit of units){const key=variantIdentity(unit.productId,unit.color,unit.storage);const row=variants.get(key)??{productId:unit.productId,name:unit.product.name,sku:unit.product.sku,color:unit.color??"Not recorded",storage:unit.storage??"Not recorded",available:0,reserved:0,sold:0};if(unit.status==="IN_STOCK")row.available++;if(unit.status==="RESERVED")row.reserved++;row.sold+=sales.get(unit.id)??0;variants.set(key,row);}
  for(const item of inventory){const tracked=tracksUnits(item.product.category,item.product.unitTracking);const identified=units.filter(unit=>unit.productId===item.productId&&["IN_STOCK","RESERVED"].includes(unit.status)).length;const count=tracked?Math.max(0,item.stockOnHand-identified):item.stockOnHand;if(!tracked||count>0){const color=tracked?"Unidentified variant":"Quantity stock",storage="Not recorded";const key=variantIdentity(item.productId,color,storage);variants.set(key,{productId:item.productId,name:item.product.name,sku:item.product.sku,color,storage,available:Math.max(0,count-(tracked?0:item.reservedStock)),reserved:tracked?0:item.reservedStock,sold:tracked?0:salesByProduct.find(row=>row.productId===item.productId)?._sum.quantity??0});}}
  const rows=[...variants].map(([key,row])=>{const target=targets.find(target=>variantIdentity(target.productId,target.color,target.storage)===key)?.targetAvailable??null;return {...row,key,target,...restockAdvice(row.available,row.sold,target)};}).sort((a,b)=>(b.suggested??0)-(a.suggested??0)||a.available-b.available||a.name.localeCompare(b.name));
  return Response.json({rows,owner:actor.role==="OWNER",windowDays:30},{headers:{"Cache-Control":"no-store"}});
}
export async function PUT(request:Request) {
  const parsed=z.object({productId:z.string().cuid(),color:z.string().trim().min(1).max(80),storage:z.string().trim().min(1).max(80),targetAvailable:z.number().int().min(0).max(100000),password:z.string().min(1).max(256)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return Response.json({error:"Choose a valid variant target."},{status:400});
  try{const actor=await requireOwner(request,parsed.data.password);const input=parsed.data;if(!await prisma.product.findFirst({where:{id:input.productId,branchId:actor.branchId??""}}))return Response.json({error:"Product not found at your shop."},{status:404});const color=input.color.toLowerCase(),storage=input.storage.toUpperCase();const target=await prisma.variantTarget.upsert({where:{productId_color_storage:{productId:input.productId,color,storage}},create:{productId:input.productId,color,storage,targetAvailable:input.targetAvailable},update:{targetAvailable:input.targetAvailable}});return Response.json(target,{headers:{"Cache-Control":"no-store"}});}catch(error){const failure=operationFailure(error);return Response.json({error:failure.error},{status:failure.status});}
}
