import { prisma } from "@/lib/prisma";
import { createSaleReceiptPdf, isSaleInvoice, type SaleReceiptData } from "@/lib/receipt-pdf";

/**
 * Rebuild a sale's receipt or invoice from the saved sale, so the copy is always available.
 * Pass the viewer's branch to limit the lookup; leave it out (or null) for every branch.
 */
export async function loadSaleDocument(saleId: string, branchId?: string | null) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, ...(branchId != null ? { branchId } : {}) },
    select: {
      invoiceNumber: true, total: true, discountAmount: true, taxAmount: true, paidAmount: true, paymentMethod: true,
      tradeInBrand: true, tradeInModel: true, tradeInValue: true, createdAt: true,
      tradeIn: { select: { storage: true, color: true, serial: true, grade: true, batteryHealth: true, hasBox: true, hasCharger: true, sellerName: true, sellerPhone: true, sellerEmail: true, sellerIdNumber: true } },
      branch: { select: { name: true, address: true, phone: true, email: true } },
      cashier: { select: { name: true } },
      customer: { select: { name: true, phone: true, email: true } },
      saleItems: { select: { quantity: true, unitPrice: true, total: true, warrantyMonths: true, product: { select: { name: true, sku: true } }, deviceUnits: { select: { imei: true, serial: true, unitCode: true } } } },
      payments: { select: { amount: true, method: true } },
    },
  });
  if (!sale) return null;
  const data: SaleReceiptData = {
    ...sale,
    createdAt: sale.createdAt.toISOString(),
    saleItems: sale.saleItems.map(({ deviceUnits, ...item }) => ({ ...item, units: deviceUnits.map((unit) => unit.imei || unit.serial || "").filter(Boolean), unitCodes: deviceUnits.map((unit) => unit.unitCode || "").filter(Boolean) })),
  };
  return data;
}

export function saleDocumentFileName(data: SaleReceiptData) {
  return `GadgetHub-${isSaleInvoice(data) ? "invoice" : "receipt"}-${data.invoiceNumber.replace(/[^A-Z0-9-]/gi, "")}.pdf`;
}

export function saleDocumentPdf(data: SaleReceiptData) {
  return Buffer.from(createSaleReceiptPdf(data).output("arraybuffer"));
}

/** The receipt or invoice as an email attachment, for notifications about one sale. */
export async function saleDocumentAttachment(saleId: string) {
  const data = await loadSaleDocument(saleId);
  if (!data) return null;
  return { filename: saleDocumentFileName(data), content: saleDocumentPdf(data) };
}
