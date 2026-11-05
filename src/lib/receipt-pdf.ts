import { jsPDF } from "jspdf";

import { brandInstagram, brandInstagramUrl, brandMarkDataUrl, brandWebsite, brandWebsiteUrl } from "@/lib/brand";
import { paymentLabel } from "@/lib/payment-labels";
import { tradeInReceiptLines, type TradeInReceiptDetails } from "@/lib/trade-in";
import { warrantyLabel } from "@/lib/warranty";

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
  tradeIn?: TradeInReceiptDetails | null;
  createdAt: string;
  branch: { name: string; address: string; phone: string; email?: string | null };
  cashier: { name: string };
  customer: { name: string; phone: string; email?: string | null } | null;
  /** `units` are the IMEIs / serials of the phones sold on that line; `unitCodes` their GadgetHub barcodes. */
  saleItems: { quantity: number; unitPrice: number; total: number; product: { name: string; sku: string }; units?: string[]; unitCodes?: string[]; warrantyMonths?: number }[];
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
  vendorName?: string | null;
  sourceName?: string | null;
  product: { name: string; sku: string; category: string; brand: string | null; costPrice: number | null };
  phoneLabel?: {
    imei: string;
    serial: string;
    mpn: string;
    modelNumber: string;
    storage: string;
    colour: string;
    batteryHealth: string;
    fmi: string;
    sim: string;
    version: string;
    name: string;
    category: string;
    group: string;
  } | null;
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const instagramLine = `Instagram: @${brandInstagram}`;

/** The shop's website and Instagram, right-aligned and clickable, one line each from `y`. */
function drawShopLinks(doc: jsPDF, right: number, y: number) {
  for (const [index, [text, url]] of [[brandWebsite, brandWebsiteUrl], [instagramLine, brandInstagramUrl]].entries()) {
    const lineY = y + index * 3.6;
    doc.text(text, right, lineY, { align: "right" });
    const width = doc.getTextWidth(text);
    doc.link(right - width, lineY - 3, width, 3.6, { url });
  }
}

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
      doc.text(`Thank you for choosing GadgetHub. ${brandWebsite} · ${instagramLine}`, margin, Math.min(y + 8, 285));
      return doc;
    },
  };
}

/** Anything not yet paid in full is an invoice; a fully paid sale gets a receipt. */
export function isSaleInvoice(receipt: Pick<SaleReceiptData, "total" | "paidAmount">) {
  return receipt.paidAmount < receipt.total;
}

/** A trade-in receipt stays on one page: phone sold, money, the phone taken in, and the GadgetHub signature. */
function createTradeInReceiptPdf(receipt: SaleReceiptData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const right = pageWidth - margin;
  const ink: [number, number, number] = [17, 17, 17];
  const muted: [number, number, number] = [107, 107, 107];
  const date = new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });
  const tradeIn = receipt.tradeIn!;
  let y = 16;

  doc.addImage(brandMarkDataUrl, "PNG", margin, y, 12, 12);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("GadgetHub", margin + 16, y + 5);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text(isSaleInvoice(receipt) ? "INVOICE" : "SALES RECEIPT", margin + 16, y + 10);
  const shop = [receipt.branch.name, receipt.branch.address, receipt.branch.phone, receipt.branch.email].filter(Boolean).join("\n");
  const shopLines = doc.splitTextToSize(shop, 78) as string[];
  doc.text(shopLines, right, y + 4, { align: "right" });
  drawShopLinks(doc, right, y + 4 + shopLines.length * 3.4);
  y = Math.max(32, y + 6 + shopLines.length * 3.4 + 8);
  doc.setDrawColor(17, 17, 17);
  doc.setLineWidth(0.4);
  doc.line(margin, y, right, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("INVOICE", margin, y);
  doc.text("CUSTOMER", right, y, { align: "right" });
  y += 5;
  doc.setTextColor(...ink);
  doc.setFontSize(12);
  doc.text(receipt.invoiceNumber, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const customerLines = [
    receipt.customer?.name ?? tradeIn.sellerName,
    receipt.customer?.phone ?? tradeIn.sellerPhone ?? "",
    receipt.customer?.email ?? tradeIn.sellerEmail ?? "",
    tradeIn.sellerIdNumber ? `ID ${tradeIn.sellerIdNumber}` : "",
  ].filter(Boolean);
  doc.text(customerLines, right, y, { align: "right" });
  doc.setTextColor(...muted);
  doc.setFontSize(8);
  doc.text(`${date} · ${receipt.cashier.name}`, margin, y + 6);
  y += Math.max(14, customerLines.length * 4.2) + 6;

  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PHONE BOUGHT", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const item of receipt.saleItems) {
    const title = doc.splitTextToSize(`${item.quantity} × ${item.product.name}`, 120) as string[];
    doc.setTextColor(...ink);
    doc.text(title, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(money(item.total), right, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += title.length * 4;
    const codes = [...(item.units ?? []).map((code) => (/^\d{15}$/.test(code) ? `IMEI ${code}` : `Serial ${code}`)), ...(item.unitCodes ?? [])].join(" · ");
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    const details = doc.splitTextToSize([codes, item.warrantyMonths !== undefined ? warrantyLabel(receipt.createdAt, item.warrantyMonths) : ""].filter(Boolean).join("\n"), right - margin) as string[];
    doc.text(details, margin, y);
    y += details.length * 4;
    doc.setFontSize(9);
    y += 1;
  }

  y += 2;
  const subtotal = receipt.saleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const rows: [string, string][] = [
    ["Subtotal", money(subtotal)],
    ...((receipt.tradeInValue ?? 0) > 0 ? [["Trade-in", `− ${money(receipt.tradeInValue ?? 0)}`] as [string, string]] : []),
    ["Total", money(receipt.total)],
    ["Paid", money(receipt.paidAmount)],
    ["Balance", money(Math.max(receipt.total - receipt.paidAmount, 0))],
  ];
  doc.setDrawColor(229, 229, 229);
  for (const [label, value] of rows) {
    doc.setTextColor(...muted);
    doc.text(label, right - 62, y);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", label === "Total" || label === "Balance" ? "bold" : "normal");
    doc.text(value, right, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 5;
  }
  if (receipt.payments.length) {
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text(receipt.payments.map((payment) => `${paymentLabel(payment.method)} ${money(payment.amount)}`).join(" · "), right, y, { align: "right" });
    y += 6;
  }

  y += 2;
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PHONE TRADED IN", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  const traded = [
    [receipt.tradeInModel, tradeIn.storage, tradeIn.color].filter(Boolean).join(" · "),
    ...tradeInReceiptLines(tradeIn),
  ].filter(Boolean);
  doc.setTextColor(...muted);
  for (const line of traded.slice(0, 7)) {
    const wrapped = doc.splitTextToSize(line, right - margin) as string[];
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.2;
  }

  const signY = 272;
  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(18);
  doc.text("GadgetHub", margin, signY);
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.3);
  doc.line(margin, signY + 2, margin + 52, signY + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  doc.text("GadgetHub signature", margin, signY + 7);
  doc.text(`${brandWebsite} · Instagram: @${brandInstagram}`, right, signY + 7, { align: "right" });
  return doc;
}

export function createSaleReceiptPdf(receipt: SaleReceiptData) {
  if (receipt.tradeIn) return createTradeInReceiptPdf(receipt);
  const documentLabel = isSaleInvoice(receipt) ? "GADGETHUB  /  INVOICE" : "GADGETHUB  /  SALES RECEIPT";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const right = pageWidth - margin;
  let y = 19;
  const ink: [number, number, number] = [17, 17, 17];
  const muted: [number, number, number] = [107, 107, 107];
  const gold: [number, number, number] = [17, 17, 17];
  const date = new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

  doc.addImage(brandMarkDataUrl, "PNG", margin, y - 6, 13, 13);
  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(documentLabel, margin + 19, y - 1);
  doc.setTextColor(...ink);
  doc.setFont("times", "normal");
  doc.setFontSize(19);
  doc.text(receipt.branch.name, margin + 19, y + 7);
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const branchLines = doc.splitTextToSize([receipt.branch.address, receipt.branch.phone, receipt.branch.email].filter(Boolean).join("\n"), 58);
  doc.text(branchLines, right, y - 1, { align: "right" });
  drawShopLinks(doc, right, y - 1 + branchLines.length * 3.6);
  y += 22;
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
  const tableHeader = () => {
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
  };
  // Later pages repeat the brand and invoice number so every sheet stands on its own.
  const continuationPage = (withTable: boolean) => {
    doc.addPage();
    y = 16;
    doc.addImage(brandMarkDataUrl, "PNG", margin, y - 5, 9, 9);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(documentLabel, margin + 12, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...muted);
    doc.text(`${receipt.invoiceNumber} (continued)`, right, y, { align: "right" });
    y += 7;
    doc.setDrawColor(229, 229, 229);
    doc.line(margin, y, right, y);
    y += 5;
    if (withTable) tableHeader();
  };
  tableHeader();

  for (const item of receipt.saleItems) {
    const titleLines = doc.splitTextToSize(item.product.name, tableWidth - 93);
    const unitText = [...(item.units ?? []).map((code) => (/^\d{15}$/.test(code) ? `IMEI ${code}` : `Sr# ${code}`)), ...(item.unitCodes ?? [])].join("  ·  ");
    const warrantyText = item.warrantyMonths !== undefined ? warrantyLabel(receipt.createdAt, item.warrantyMonths) : "";
    const unitLines = doc.splitTextToSize([unitText, warrantyText].filter(Boolean).join("\n"), tableWidth - 93) as string[];
    const rowHeight = Math.max(11, titleLines.length * 4 + unitLines.length * 3.6 + 6);
    if (y + rowHeight > 268) continuationPage(true);
    doc.setDrawColor(229, 229, 229);
    doc.line(margin, y + rowHeight, right, y + rowHeight);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(titleLines, margin + 3, y + 5);
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    if (unitLines.length) {
      doc.setTextColor(...ink);
      doc.text(unitLines, margin + 3, y + titleLines.length * 4 + 4.4);
      doc.setTextColor(...muted);
    }
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
  // Keep the payment summary together; it moves to the next page only when it cannot fit.
  const summaryHeight = 52 + (receipt.paymentLinks?.length ?? 0) * 12 + ((receipt.discountAmount ?? 0) > 0 ? 6 : 0) + ((receipt.tradeInValue ?? 0) > 0 ? 6 : 0) + (receipt.tradeIn ? 20 : 0) + ((receipt.taxAmount ?? 0) > 0 ? 6 : 0);
  if (y + summaryHeight > 285) continuationPage(false);
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
    ? receipt.payments.map((payment) => `${paymentLabel(payment.method)}  ${money(payment.amount)}`)
    : ["Credit sale - payment outstanding"];
  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(paymentLines, margin, y + 7);
  let leftBottom = y + 7 + paymentLines.length * 4.5;
  if (receipt.tradeIn) {
    const tradeInLines = doc.splitTextToSize([receipt.tradeInModel ?? "Device", ...tradeInReceiptLines(receipt.tradeIn)].join("\n"), totalLabelX - margin - 6) as string[];
    leftBottom += 4;
    doc.setTextColor(...gold);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TRADE-IN RECEIVED", margin, leftBottom);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(tradeInLines, margin, leftBottom + 6);
    leftBottom += 6 + tradeInLines.length * 4.5;
  }
  y += 7;

  doc.setDrawColor(229, 229, 229);
  doc.line(totalLabelX, y, right, y);
  y += 7;
  amountRow("Subtotal", money(subtotal));
  if ((receipt.discountAmount ?? 0) > 0) amountRow("Discount", `- ${money(receipt.discountAmount ?? 0)}`);
  if ((receipt.tradeInValue ?? 0) > 0) amountRow("Trade-in", `- ${money(receipt.tradeInValue ?? 0)}`);
  if ((receipt.taxAmount ?? 0) > 0) amountRow("Tax", money(receipt.taxAmount ?? 0));
  amountRow("Total", money(receipt.total), { strong: true, color: ink });
  amountRow("Paid", money(receipt.paidAmount));
  amountRow("Balance due", money(Math.max(receipt.total - receipt.paidAmount, 0)), { strong: true, color: gold });
  y = Math.max(y, leftBottom);
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

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setTextColor(...muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`Page ${page} of ${pages}`, right, 292, { align: "right" });
    }
  }
  return doc;
}

export function downloadSaleReceipt(receipt: SaleReceiptData) {
  createSaleReceiptPdf(receipt).save(`GadgetHub-${isSaleInvoice(receipt) ? "invoice" : "receipt"}-${safeFilePart(receipt.invoiceNumber) || "sale"}.pdf`);
}

export function createLayawayPaymentReceiptPdf(
  order: LayawayReceiptData,
  payment: LayawayPaymentReceiptData,
  balanceAfterPayment: number,
) {
  const pdf = createDocument("Layaway installment receipt", order.branch.name, new Date(payment.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }));
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
  pdf.line("Method", paymentLabel(payment.method));
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
  const date = new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

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
  label("Supplier / source", margin + 86, y);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(receipt.receivedBy, margin, y + 7);
  doc.text(receipt.vendorName || receipt.sourceName || receipt.reference || "Not provided", margin + 86, y + 7);

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
