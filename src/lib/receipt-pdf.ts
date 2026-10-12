import { jsPDF } from "jspdf";

export type SaleReceiptData = {
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  paymentMethod: string;
  createdAt: string;
  branch: { name: string; address: string; phone: string };
  cashier: { name: string };
  customer: { name: string; phone: string } | null;
  saleItems: { quantity: number; unitPrice: number; total: number; product: { name: string; sku: string } }[];
  payments: { amount: number; method: string }[];
};

export type LayawayReceiptData = {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  customer: { name: string; phone: string };
  branch: { name: string };
  sale: { invoiceNumber: string } | null;
};

export type LayawayPaymentReceiptData = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  createdAt: string;
  receivedBy: { name: string };
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const safeFilePart = (value: string) => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80);

function createDocument(title: string, branchName: string, date: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("GadgetHub", margin, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(branchName, pageWidth - margin, y, { align: "right" });
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(date, margin, y);
  y += 5;
  doc.setDrawColor(190, 198, 190);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  return {
    doc,
    margin,
    pageWidth,
    get y() { return y; },
    set y(value: number) { y = value; },
    line(label: string, value: string) {
      doc.setFont("helvetica", "bold");
      doc.text(label, margin, y);
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(value || "-", pageWidth - margin * 2 - 40);
      doc.text(wrapped, margin + 40, y);
      y += Math.max(5, wrapped.length * 4.5);
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    },
    section(label: string) {
      y += 3;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(label, margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    },
    finish() {
      doc.setFontSize(8);
      doc.setTextColor(110, 120, 112);
      doc.text("Thank you for choosing GadgetHub.", margin, Math.min(y + 8, 285));
      return doc;
    },
  };
}

export function createSaleReceiptPdf(receipt: SaleReceiptData) {
  const pdf = createDocument("Sales receipt", receipt.branch.name, new Date(receipt.createdAt).toLocaleString("en-KE"));
  pdf.line("Invoice", receipt.invoiceNumber);
  pdf.line("Branch", `${receipt.branch.address} | ${receipt.branch.phone}`);
  pdf.line("Cashier", receipt.cashier.name);
  if (receipt.customer) pdf.line("Customer", `${receipt.customer.name} | ${receipt.customer.phone}`);

  pdf.section("Items");
  for (const item of receipt.saleItems) {
    pdf.line(`${item.quantity} x ${item.product.name} (${item.product.sku})`, `${money(item.unitPrice)} each | ${money(item.total)}`);
  }

  pdf.section("Payment");
  pdf.line("Total", money(receipt.total));
  pdf.line("Paid", money(receipt.paidAmount));
  pdf.line("Balance", money(receipt.total - receipt.paidAmount));
  for (const payment of receipt.payments) pdf.line(payment.method, money(payment.amount));
  return pdf.finish();
}

export function downloadSaleReceipt(receipt: SaleReceiptData) {
  createSaleReceiptPdf(receipt).save(`${safeFilePart(receipt.invoiceNumber) || "gadgethub-receipt"}.pdf`);
}

export function createLayawayPaymentReceiptPdf(
  order: LayawayReceiptData,
  payment: LayawayPaymentReceiptData,
  balanceAfterPayment: number,
) {
  const pdf = createDocument("Layaway installment receipt", order.branch.name, new Date(payment.createdAt).toLocaleString("en-KE"));
  pdf.line("Order", `LAY-${order.id.slice(-10).toUpperCase()}`);
  pdf.line("Payment receipt", payment.id);
  pdf.line("Customer", `${order.customer.name} | ${order.customer.phone}`);
  pdf.line("Received by", payment.receivedBy.name);
  pdf.section("Reserved item");
  pdf.line("Product", `${order.quantity} x ${order.productName} (${order.productSku})`);
  pdf.line("Locked unit price", money(order.unitPrice));
  pdf.line("Order total", money(order.totalAmount));
  pdf.section("Installment");
  pdf.line("Received", money(payment.amount));
  pdf.line("Method", payment.method);
  if (payment.reference) pdf.line("Reference", payment.reference);
  pdf.line("Paid to date", money(order.totalAmount - balanceAfterPayment));
  pdf.line("Balance after payment", money(balanceAfterPayment));
  if (order.sale) pdf.line("Pickup invoice", order.sale.invoiceNumber);
  return pdf.finish();
}

export function downloadLayawayPaymentReceipt(
  order: LayawayReceiptData,
  payment: LayawayPaymentReceiptData,
  balanceAfterPayment: number,
) {
  createLayawayPaymentReceiptPdf(order, payment, balanceAfterPayment)
    .save(`${safeFilePart(`layaway-${order.id}-${payment.id}`) || "layaway-receipt"}.pdf`);
}
