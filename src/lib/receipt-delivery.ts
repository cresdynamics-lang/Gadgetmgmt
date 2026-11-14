import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications";
import { saleIdFromReceiptKey } from "@/lib/money-in";
import { createSaleReceiptPdf } from "@/lib/receipt-pdf";

/** Builds the receipt PDF for the sale named in a receipt notification, as base64 for the email provider. */
export async function receiptAttachment(dedupeKey: string, db: PrismaClient = prisma) {
  const saleId = saleIdFromReceiptKey(dedupeKey);
  if (!saleId) return undefined;
  const sale = await db.sale.findFirst({
    where: { id: saleId, status: { in: ["PAID", "PARTIAL"] } },
    select: {
      invoiceNumber: true, total: true, paidAmount: true, discountAmount: true, taxAmount: true, paymentMethod: true, createdAt: true,
      branch: { select: { name: true, address: true, phone: true } },
      cashier: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      saleItems: { select: { quantity: true, unitPrice: true, total: true, product: { select: { name: true, sku: true } } } },
      payments: { select: { amount: true, method: true, reference: true } },
    },
  });
  if (!sale) return undefined;
  const pdf = createSaleReceiptPdf({ ...sale, createdAt: sale.createdAt.toISOString() });
  return [{ filename: `${sale.invoiceNumber.replace(/[^a-z0-9-]/gi, "")}.pdf`, content: Buffer.from(pdf.output("arraybuffer")).toString("base64") }];
}

export async function deliverQueuedReceipt(id:string,deliver:typeof deliverNotification=deliverNotification,db:PrismaClient=prisma) {
  const record=await db.customerNotification.findFirst({where:{id,kind:"SALE_RECEIPT",status:"QUEUED",attempts:{lt:5}}});
  if(!record)return;
  const claimed=await db.customerNotification.updateMany({where:{id,status:"QUEUED",attempts:record.attempts},data:{status:"PROCESSING",attempts:{increment:1}}});
  if(!claimed.count)return;
  try {
    const attachments=await receiptAttachment(record.dedupeKey,db);
    await deliver({purpose:"orders",channel:"EMAIL",recipient:record.recipient,subject:record.subject,body:record.body,idempotencyKey:record.id,attachments});
    await db.customerNotification.update({where:{id},data:{status:"SENT",sentAt:new Date(),lastError:null}});
  }catch {
    await db.customerNotification.update({where:{id},data:{status:record.attempts+1>=5?"FAILED":"QUEUED",lastError:"Receipt email delivery was not confirmed. Check the configured sender and retry."}});
    throw new Error("Receipt delivery failed");
  }
}
