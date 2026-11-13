import { z } from "zod";
import { auth } from "@/auth";
import { canUseCapability } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { createSaleReceiptPdf } from "@/lib/receipt-pdf";
import { sameOrigin } from "@/lib/staff-alerts";
async function receiptSale(id:string) {
  const session=await auth();
  if(!session?.user || !await canUseCapability(session.user.role,"sales",session.user.id))return null;
  return prisma.sale.findFirst({where:{id,status:{in:["PAID","PARTIAL"]},...(session.user.role==="OWNER"?{}:{branchId:session.user.branchId??""})},select:{id:true,branchId:true,customerId:true,invoiceNumber:true,total:true,paidAmount:true,discountAmount:true,taxAmount:true,paymentMethod:true,createdAt:true,branch:{select:{name:true,address:true,phone:true}},cashier:{select:{name:true}},customer:{select:{name:true,phone:true}},saleItems:{select:{quantity:true,unitPrice:true,total:true,product:{select:{name:true,sku:true}}}},payments:{select:{amount:true,method:true}}}});
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const sale=await receiptSale(id);
  if(!sale)return Response.json({error:"Receipt unavailable or access denied."},{status:404});
  if(request.headers.get("accept")?.includes("application/json")) {
    const deliveries=await prisma.customerNotification.findMany({where:{kind:"SALE_RECEIPT",dedupeKey:{startsWith:`receipt:${id}:`}},select:{id:true,status:true,attempts:true,sentAt:true},orderBy:{createdAt:"desc"},take:5});
    return Response.json({deliveries},{headers:{"Cache-Control":"no-store"}});
  }
  const pdf=createSaleReceiptPdf({...sale,createdAt:sale.createdAt.toISOString()});
  return new Response(Buffer.from(pdf.output("arraybuffer")),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename=${sale.invoiceNumber.replace(/[^a-z0-9-]/gi,"")}.pdf`,"Cache-Control":"no-store"}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!sameOrigin(request))return Response.json({error:"Access denied."},{status:403});
  const input=z.object({requestKey:z.uuid(),email:z.email()}).safeParse(await request.json().catch(()=>null));
  if(!input.success)return Response.json({error:"Enter a valid receipt email address."},{status:400});
  const {id}=await params;const sale=await receiptSale(id);
  if(!sale)return Response.json({error:"Receipt unavailable or access denied."},{status:404});
  const key=`receipt:${id}:${input.data.requestKey}`;
  const previous=await prisma.customerNotification.findUnique({where:{dedupeKey:key}});
  if(previous && previous.recipient!==input.data.email)return Response.json({error:"This request key was used for another recipient."},{status:409});
  const notification=previous??await prisma.customerNotification.upsert({where:{dedupeKey:key},update:{},create:{branchId:sale.branchId,customerId:sale.customerId,kind:"SALE_RECEIPT",channel:"EMAIL",recipient:input.data.email,subject:`GadgetHub receipt ${sale.invoiceNumber}`,body:[`Receipt ${sale.invoiceNumber}`,`${sale.branch.name} · ${sale.createdAt.toISOString()}`,...sale.saleItems.map(item=>`${item.product.name} (${item.product.sku}) × ${item.quantity}: KES ${item.total.toLocaleString()}`),`Total: KES ${sale.total.toLocaleString()}`,`Recorded paid: KES ${sale.paidAmount.toLocaleString()}`,`Served by ${sale.cashier.name}`,`Shop contact: ${sale.branch.phone}`].join("\n"),dedupeKey:key}});
  if(notification.recipient!==input.data.email)return Response.json({error:"This request key belongs to another recipient."},{status:409});
  if(notification.status==="FAILED")await prisma.customerNotification.updateMany({where:{id:notification.id,status:"FAILED"},data:{status:"QUEUED",attempts:0,lastError:null}});
  return Response.json({id:notification.id,status:notification.status==="FAILED"?"QUEUED":notification.status},{status:202,headers:{"Cache-Control":"no-store"}});
}
