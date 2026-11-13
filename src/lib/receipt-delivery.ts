import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications";
export async function deliverQueuedReceipt(id:string,deliver:typeof deliverNotification=deliverNotification,db:PrismaClient=prisma) {
  const record=await db.customerNotification.findFirst({where:{id,kind:"SALE_RECEIPT",status:"QUEUED",attempts:{lt:5}}});
  if(!record)return;
  const claimed=await db.customerNotification.updateMany({where:{id,status:"QUEUED",attempts:record.attempts},data:{status:"PROCESSING",attempts:{increment:1}}});
  if(!claimed.count)return;
  try {
    await deliver({channel:"EMAIL",recipient:record.recipient,subject:record.subject,body:record.body,idempotencyKey:record.id});
    await db.customerNotification.update({where:{id},data:{status:"SENT",sentAt:new Date(),lastError:null}});
  }catch {
    await db.customerNotification.update({where:{id},data:{status:record.attempts+1>=5?"FAILED":"QUEUED",lastError:"Receipt email delivery was not confirmed. Check the configured sender and retry."}});
    throw new Error("Receipt delivery failed");
  }
}
