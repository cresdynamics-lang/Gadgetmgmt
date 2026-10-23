import { jsPDF } from "jspdf";

import { brandMarkDataUrl } from "@/lib/brand";

export type SaleReceiptData = {
  invoiceNumber: string;
  total: number;
  discountAmount?: number;
  taxAmount?: number;
  paidAmount: number;
  paymentMethod: string;
  tradeInBrand?: string | null;
  tradeInModel?: string | null;
  tradeInValue?: number;
  createdAt: string;
  branch: { name: string; address: string; phone: string };
  cashier: { name: string };
  customer: { name: string; phone: string } | null;
  saleItems: { quantity: number; unitPrice: number; total: number; product: { name: string; sku: string } }[];
  payments: { amount: number; method: string }[];
  paymentLinks?: { label: string; url: string }[];
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

export type CreditAgreementData = {
  planReference: string;
  customer: { name: string; phone: string };
  branch: { name: string };
  product: { name: string; sku: string };
  imei: string | null;
  totalAmount: number;
  depositAmount: number;
  balance: number;
  termMonths: number;
  installments: { sequence: number; dueDate: string; amount: number }[];
  payUrl?: string;
};

export type InventoryReceiptData = {
  id: string;
  createdAt: string;
  branchName: string;
  receivedBy: string;
  reference: string | null;
  note: string | null;
  quantity: number;
  previousStock: number;
  newStock: number;
  product: { name: string; sku: string; category: string; brand: string | null; costPrice: number | null };
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const safeFilePart = (value: string) => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80);

function createDocument(title: string, branchName: string, date: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  let y = 20;

  doc.addImage(brandMarkDataUrl, "PNG", margin, y - 6, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("GadgetHub", margin + 13, y);
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
  doc.setDrawColor(229, 229, 229);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  return {
    doc,
    margin,
    pageWidth,
    get y() { return y; },
    set y(value: number) { y = value; },
    link(label: string, url: string) {
      doc.setFont("helvetica", "bold");
      doc.text(label, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(17, 17, 17);
      doc.textWithLink(url, margin + 40, y, { url });
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    },
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
      doc.setTextColor(107, 107, 107);
      doc.text("Thank you for choosing GadgetHub.", margin, Math.min(y + 8, 285));
      return doc;
    },
  };
}

export function createSaleReceiptPdf(receipt: SaleReceiptData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const right = pageWidth - margin;
  let y = 19;
  const ink: [number, number, number] = [17, 17, 17];
  const muted: [number, number, number] = [107, 107, 107];
  const gold: [number, number, number] = [17, 17, 17];
  const date = new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

  doc.addImage(brandMarkDataUrl, "PNG", margin, y - 6, 13, 13);
  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GADGETHUB  /  SALES RECEIPT", margin + 19, y - 1);
  doc.setTextColor(...ink);
  doc.setFont("times", "normal");
  doc.setFontSize(19);
  doc.text(receipt.branch.name, margin + 19, y + 7);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const branchLines = doc.splitTextToSize(`${receipt.branch.address}\n${receipt.branch.phone}`, 58);
  doc.text(branchLines, right, y - 1, { align: "right" });
  y += 19;
  doc.setDrawColor(229, 229, 229);
  doc.line(margin, y, right, y);
  y += 10;

  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("INVOICE NUMBER", margin, y);
  doc.text(receipt.customer ? "BILLED TO" : "CUSTOMER", right, y, { align: "right" });
  y += 6;
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(receipt.invoiceNumber, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(receipt.customer?.name ?? "Walk-in customer", right, y, { align: "right" });
  y += 5;
  doc.setTextColor(...muted);
  doc.setFontSize(8);
  doc.text(date, margin, y);
  if (receipt.customer?.phone) doc.text(receipt.customer.phone, right, y, { align: "right" });
  y += 11;

  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PURCHASE DETAILS", margin, y);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.text(`Served by ${receipt.cashier.name}`, right, y, { align: "right" });
  y += 5;
  const tableWidth = pageWidth - margin * 2;
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, tableWidth, 9, "F");
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("ITEM", margin + 3, y + 5.8);
  doc.text("QTY", right - 76, y + 5.8, { align: "right" });
  doc.text("UNIT PRICE", right - 34, y + 5.8, { align: "right" });
  doc.text("AMOUNT", right - 3, y + 5.8, { align: "right" });
  y += 9;

  for (const item of receipt.saleItems) {
    const titleLines = doc.splitTextToSize(item.product.name, tableWidth - 93);
    const rowHeight = Math.max(13, titleLines.length * 4 + 7);
    if (y + rowHeight > 258) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(229, 229, 229);
    doc.line(margin, y + rowHeight, right, y + rowHeight);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(titleLines, margin + 3, y + 5);
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    doc.text(`SKU ${item.product.sku}`, margin + 3, y + rowHeight - 2);
    doc.setFontSize(8.5);
    doc.text(String(item.quantity), right - 76, y + 6, { align: "right" });
    doc.text(money(item.unitPrice), right - 34, y + 6, { align: "right" });
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.text(money(item.total), right - 3, y + 6, { align: "right" });
    y += rowHeight;
  }

  y += 10;
  if (y > 239) { doc.addPage(); y = 20; }
  const totalLabelX = right - 67;
  const totalValueX = right;
  const subtotal = receipt.saleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const amountRow = (label: string, value: string, opts: { strong?: boolean; color?: [number, number, number] } = {}) => {
    doc.setTextColor(...(opts.color ?? muted));
    doc.setFont("helvetica", opts.strong ? "bold" : "normal");
    doc.setFontSize(opts.strong ? 10 : 9);
    doc.text(label, totalLabelX, y);
    doc.text(value, totalValueX, y, { align: "right" });
    y += opts.strong ? 8 : 6;
  };
  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PAYMENT DETAILS", margin, y);
  const paymentLines = receipt.payments.length
    ? receipt.payments.map((payment) => `${payment.method === "MPESA" ? "M-Pesa" : payment.method}  ${money(payment.amount)}`)
    : ["Credit sale - payment outstanding"];
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(paymentLines, margin, y + 7);
  y += 7;

  doc.setDrawColor(229, 229, 229);
  doc.line(totalLabelX, y, right, y);
  y += 7;
  amountRow("Subtotal", money(subtotal));
  if ((receipt.discountAmount ?? 0) > 0) amountRow("Discount", `- ${money(receipt.discountAmount ?? 0)}`);
  if ((receipt.tradeInValue ?? 0) > 0) amountRow(receipt.tradeInModel ? `Trade-in · ${receipt.tradeInModel}` : "Trade-in", `- ${money(receipt.tradeInValue ?? 0)}`);
  if ((receipt.taxAmount ?? 0) > 0) amountRow("Tax", money(receipt.taxAmount ?? 0));
  amountRow("Total", money(receipt.total), { strong: true, color: ink });
  amountRow("Paid", money(receipt.paidAmount));
  amountRow("Balance due", money(Math.max(receipt.total - receipt.paidAmount, 0)), { strong: true, color: gold });
  if (receipt.paymentLinks?.length) {
    y += 4;
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PAY ONLINE", margin, y);
    y += 6;
    for (const link of receipt.paymentLinks) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(link.label, margin, y);
      y += 5;
      doc.setTextColor(17, 17, 17);
      doc.setFontSize(8);
      doc.textWithLink(link.url, margin, y, { url: link.url });
      doc.setTextColor(...muted);
      y += 7;
    }
  }

  const footerY = Math.min(Math.max(y + 8, 275), 285);
  doc.setDrawColor(229, 229, 229);
  doc.line(margin, footerY - 5, right, footerY - 5);
  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.text("Thank you for choosing GadgetHub.", pageWidth / 2, footerY, { align: "center" });
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Keep this receipt for your records", pageWidth / 2, footerY + 5, { align: "center" });
  return doc;
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

export function downloadCreditAgreementPdf(agreement: CreditAgreementData) {
  const pdf = createDocument("Lipa payment agreement", agreement.branch.name, new Date().toLocaleDateString("en-KE", { dateStyle: "long", timeZone: "Africa/Nairobi" }));
  pdf.line("Plan reference", agreement.planReference);
  pdf.line("Customer", `${agreement.customer.name} | ${agreement.customer.phone}`);
  pdf.line("Product", `${agreement.product.name} (${agreement.product.sku})`);
  if (agreement.imei) pdf.line("Device IMEI", agreement.imei);
  pdf.section("Payment terms");
  pdf.line("Cash price", money(agreement.totalAmount));
  pdf.line("Deposit received", money(agreement.depositAmount));
  pdf.line("Financed balance", money(agreement.balance));
  pdf.line("Repayment term", `${agreement.termMonths} months`);
  if (agreement.payUrl) {
    pdf.section("Pay this plan");
    pdf.link("Payment page", agreement.payUrl);
  }
  pdf.section("Repayment schedule");
  for (const installment of agreement.installments) {
    pdf.line(`Payment ${installment.sequence} · ${new Date(installment.dueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })}`, money(installment.amount));
  }
  pdf.section("Acknowledgement");
  pdf.line("Customer signature", "________________________________________");
  pdf.line("Business representative", "____________________________________");
  pdf.line("Date", "____________________");
  pdf.line("Agreement note", "Payments are recorded against this plan reference. Please retain this schedule and contact the branch if you need support.");
  pdf.finish().save(`${safeFilePart(`lipa-agreement-${agreement.planReference}`) || "gadgethub-lipa-agreement"}.pdf`);
}

export function downloadInventoryReceipt(receipt: InventoryReceiptData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 18;
  const right = width - margin;
  const ink: [number, number, number] = [17, 17, 17];
  const muted: [number, number, number] = [107, 107, 107];
  const jade: [number, number, number] = [17, 17, 17];
  const brass: [number, number, number] = [17, 17, 17];
  const date = new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

  doc.setFillColor(17, 17, 17);
  doc.roundedRect(margin, 17, right - margin, 48, 4, 4, "F");
  doc.addImage(brandMarkDataUrl, "PNG", margin + 9, 27, 13, 13);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("GadgetHub", margin + 28, 32);
  doc.setTextColor(196, 196, 196);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(receipt.branchName, margin + 28, 38);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GOODS RECEIVED NOTE", right - 8, 29, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`GRN-${receipt.id.slice(-8).toUpperCase()}`, right - 8, 37, { align: "right" });
  doc.setTextColor(196, 196, 196);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(date, right - 8, 44, { align: "right" });

  let y = 79;
  const label = (text: string, x: number, at: number) => {
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(text.toUpperCase(), x, at);
  };
  label("Received by", margin, y);
  label("Supplier reference", margin + 86, y);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(receipt.receivedBy, margin, y + 7);
  doc.text(receipt.reference || "Not provided", margin + 86, y + 7);

  y += 22;
  doc.setDrawColor(229, 229, 229);
  doc.line(margin, y, right, y);
  y += 13;
  label("Product received", margin, y);
  doc.setTextColor(...ink);
  doc.setFont("times", "bold");
  doc.setFontSize(17);
  const productLines = doc.splitTextToSize(receipt.product.name, 112);
  doc.text(productLines, margin, y + 10);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${receipt.product.brand ? `${receipt.product.brand} · ` : ""}${receipt.product.category} · SKU ${receipt.product.sku}`, margin, y + 18 + (productLines.length - 1) * 7);

  const boxY = y + 32 + (productLines.length - 1) * 7;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, boxY, right - margin, 34, 3, 3, "F");
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("UNITS RECEIVED", margin + 8, boxY + 10);
  doc.setTextColor(...jade);
  doc.setFont("times", "bold");
  doc.setFontSize(23);
  doc.text(`+${receipt.quantity.toLocaleString("en-KE")}`, margin + 8, boxY + 24);
  doc.setDrawColor(229, 229, 229);
  doc.line(margin + 63, boxY + 7, margin + 63, boxY + 27);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("PREVIOUS STOCK", margin + 72, boxY + 10);
  doc.text("NEW STOCK", right - 8, boxY + 10, { align: "right" });
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(receipt.previousStock.toLocaleString("en-KE"), margin + 72, boxY + 21);
  doc.setTextColor(...jade);
  doc.setFont("helvetica", "bold");
  doc.text(receipt.newStock.toLocaleString("en-KE"), right - 8, boxY + 21, { align: "right" });

  const tableY = boxY + 50;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, tableY, right - margin, 11, 2, 2, "F");
  label("Item details", margin + 5, tableY + 7);
  label("Unit cost", right - 38, tableY + 7);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Received into branch inventory", margin + 5, tableY + 21);
  doc.text(receipt.product.costPrice === null ? "—" : money(receipt.product.costPrice), right - 5, tableY + 21, { align: "right" });
  doc.setDrawColor(229, 229, 229);
  doc.line(margin, tableY + 28, right, tableY + 28);

  if (receipt.note) {
    label("Receiving note", margin, tableY + 42);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(receipt.note, right - margin), margin, tableY + 49);
  }

  const footerY = Math.max(tableY + (receipt.note ? 72 : 56), 249);
  doc.setDrawColor(229, 229, 229);
  doc.line(margin, footerY, right, footerY);
  doc.setTextColor(...brass);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("INVENTORY MOVEMENT", margin, footerY + 7);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.text(receipt.id, margin, footerY + 12);
  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.text("Received, checked, and recorded.", right, footerY + 8, { align: "right" });
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("GadgetHub · Stock control", right, footerY + 13, { align: "right" });

  doc.save(`${safeFilePart(`GRN-${receipt.id.slice(-8)}`) || "gadgethub-goods-received"}.pdf`);
}
