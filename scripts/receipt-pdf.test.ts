import assert from "node:assert/strict";
import test from "node:test";
import { createLayawayPaymentReceiptPdf, createSaleReceiptPdf } from "../src/lib/receipt-pdf";

const sale = {
  invoiceNumber: "GH-261012-TEST",
  total: 12000,
  paidAmount: 12000,
  paymentMethod: "CASH",
  createdAt: "2026-10-12T12:00:00.000Z",
  branch: { name: "Westlands", address: "Nairobi", phone: "+254700000000" },
  cashier: { name: "Test cashier" },
  customer: { name: "Test customer", phone: "+254711111111" },
  saleItems: [{ quantity: 1, unitPrice: 12000, total: 12000, product: { name: "Test product", sku: "TEST-001" } }],
  payments: [{ amount: 12000, method: "CASH" }],
};

const order = {
  id: "cmgtestorder1234567890",
  productName: "Test product",
  productSku: "TEST-001",
  quantity: 1,
  unitPrice: 12000,
  totalAmount: 12000,
  customer: { name: "Test customer", phone: "+254711111111" },
  branch: { name: "Westlands" },
  sale: { invoiceNumber: "GH-LAY-261012-TEST" },
};

const payment = {
  id: "cmgtestpayment1234567890",
  amount: 12000,
  method: "MPESA",
  reference: "QWERTY123",
  createdAt: "2026-10-12T12:00:00.000Z",
  receivedBy: { name: "Test cashier" },
};

function assertPdf(data: ArrayBuffer) {
  const header = new TextDecoder().decode(data.slice(0, 5));
  assert.equal(header, "%PDF-");
  assert.ok(data.byteLength > 1000);
}

test("creates a downloadable POS sale PDF", () => {
  assertPdf(createSaleReceiptPdf(sale).output("arraybuffer"));
});

test("creates a downloadable layaway installment PDF", () => {
  assertPdf(createLayawayPaymentReceiptPdf(order, payment, 0).output("arraybuffer"));
});