import { brandInstagram, brandWebsite } from "@/lib/brand";
import { queueAndSendNotice } from "@/lib/customer-notice";
import { prisma } from "@/lib/prisma";

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

/**
 * Email the customer a receipt (or invoice, if part-paid) for a sale, with the PDF attached.
 * `recipient` covers walk-ins with no customer email. Safe to call twice: it is deduplicated per sale,
 * unless `resend` is set, which sends a fresh copy (to `recipient` first, if given).
 * Returns whether the email went out.
 */
export async function sendSaleReceiptEmail(saleId: string, recipient?: string | null, resend = false): Promise<boolean> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true, invoiceNumber: true, branchId: true, customerId: true, status: true, total: true, paidAmount: true, tradeInValue: true, tradeInModel: true, createdAt: true,
        customer: { select: { name: true, email: true } },
        branch: { select: { name: true, phone: true } },
        saleItems: { select: { quantity: true, total: true, product: { select: { name: true } }, deviceUnits: { select: { imei: true, serial: true } } } },
        payments: { select: { method: true, amount: true, reference: true } },
      },
    });
    const to = resend ? recipient || sale?.customer?.email : sale?.customer?.email || recipient;
    if (!sale || !to || (sale.status !== "PAID" && sale.status !== "PARTIAL")) return false;
    const lines = sale.saleItems.map((item) => {
      const codes = item.deviceUnits.map((unit) => unit.imei ? `IMEI ${unit.imei}` : `Serial ${unit.serial}`);
      return `• ${item.quantity} × ${item.product.name}: ${money(item.total)}${codes.length ? `\n   ${codes.join(", ")}` : ""}`;
    });
    const payments = sale.payments.map((payment) => `${payment.method === "MPESA" ? "M-Pesa" : payment.method === "CARD" ? "Card" : "Cash"} ${money(payment.amount)}${payment.reference ? ` (${payment.reference})` : ""}`);
    const balance = Math.max(0, sale.total - sale.paidAmount);
    const notice = await queueAndSendNotice({
      branchId: sale.branchId,
      customerId: sale.customerId,
      channel: "EMAIL",
      kind: "SALE_RECEIPT",
      recipient: to,
      subject: `Your Gadget Hub ${balance > 0 ? "invoice" : "receipt"} ${sale.invoiceNumber}`,
      body: [
        `Hello ${sale.customer?.name ?? "there"}, thank you for shopping at Gadget Hub ${sale.branch.name}. Your ${balance > 0 ? "invoice" : "receipt"} is attached as a PDF.`,
        `Receipt ${sale.invoiceNumber} · ${sale.createdAt.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}`,
        "",
        ...lines,
        ...(sale.tradeInValue > 0 ? [`• Trade-in${sale.tradeInModel ? ` (${sale.tradeInModel})` : ""}: −${money(sale.tradeInValue)}`] : []),
        "",
        `Total: ${money(sale.total)}`,
        `Paid: ${money(sale.paidAmount)}${payments.length ? ` · ${payments.join(", ")}` : ""}`,
        ...(balance > 0 ? [`Balance on your Lipa Mdogo Mdogo plan: ${money(balance)}`] : []),
        "",
        `Questions? Call us on ${sale.branch.phone} or reply to this email.`,
        `${brandWebsite} · Instagram: @${brandInstagram}`,
      ].join("\n"),
      dedupeKey: resend ? `sale-receipt:${sale.id}:${Date.now().toString(36)}` : `sale-receipt:${sale.id}`,
    });
    return notice.sent;
  } catch (error) {
    console.error("Sale receipt email could not be sent", saleId, error instanceof Error ? error.message : "unknown error");
    return false;
  }
}
