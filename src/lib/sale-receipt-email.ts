import { queueAndSendNotice } from "@/lib/customer-notice";
import { prisma } from "@/lib/prisma";

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

/** Email the customer a receipt for a paid or part-paid sale. Safe to call twice: it is deduplicated per sale. */
export async function sendSaleReceiptEmail(saleId: string) {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true, invoiceNumber: true, branchId: true, customerId: true, status: true, total: true, paidAmount: true, tradeInValue: true, tradeInModel: true, createdAt: true,
        customer: { select: { name: true, email: true } },
        branch: { select: { name: true, phone: true } },
        saleItems: { select: { quantity: true, total: true, product: { select: { name: true } } } },
        payments: { select: { method: true, amount: true, reference: true } },
      },
    });
    if (!sale?.customer?.email || (sale.status !== "PAID" && sale.status !== "PARTIAL")) return;
    const lines = sale.saleItems.map((item) => `• ${item.quantity} × ${item.product.name}: ${money(item.total)}`);
    const payments = sale.payments.map((payment) => `${payment.method === "MPESA" ? "M-Pesa" : payment.method === "CARD" ? "Card" : "Cash"} ${money(payment.amount)}${payment.reference ? ` (${payment.reference})` : ""}`);
    const balance = Math.max(0, sale.total - sale.paidAmount);
    await queueAndSendNotice({
      branchId: sale.branchId,
      customerId: sale.customerId,
      channel: "EMAIL",
      kind: "SALE_RECEIPT",
      recipient: sale.customer.email,
      subject: `Your Gadget Hub receipt ${sale.invoiceNumber}`,
      body: [
        `Hello ${sale.customer.name}, thank you for shopping at Gadget Hub ${sale.branch.name}.`,
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
      ].join("\n"),
      dedupeKey: `sale-receipt:${sale.id}`,
    });
  } catch (error) {
    console.error("Sale receipt email could not be sent", saleId, error instanceof Error ? error.message : "unknown error");
  }
}
