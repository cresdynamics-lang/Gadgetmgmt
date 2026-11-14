import assert from "node:assert/strict";
import test from "node:test";
import { effectiveDepositPercent, referenceProblem, requiresOwnerTick, saleIdFromReceiptKey, saleReceiptEmail } from "../src/lib/money-in";

test("M-Pesa, bank and trade-in credit wait for the owner's tick; cash and card do not", () => {
  assert.equal(requiresOwnerTick("MPESA"), true);
  assert.equal(requiresOwnerTick("BANK"), true);
  assert.equal(requiresOwnerTick("TRADE_IN"), true);
  assert.equal(requiresOwnerTick("CASH"), false);
  assert.equal(requiresOwnerTick("CARD"), false);
});

test("references are required for M-Pesa and bank, and refused for cash and card", () => {
  assert.match(referenceProblem("MPESA", "") ?? "", /M-Pesa/);
  assert.equal(referenceProblem("MPESA", "QK12AB34CD"), null);
  assert.match(referenceProblem("BANK", undefined) ?? "", /bank/i);
  assert.equal(referenceProblem("BANK", "FT2611140001"), null);
  assert.equal(referenceProblem("CASH", null), null);
  assert.match(referenceProblem("CARD", "ABC123") ?? "", /only recorded/);
});

test("Lipa deposit never drops below 40%", () => {
  assert.equal(effectiveDepositPercent(20), 40);
  assert.equal(effectiveDepositPercent(null), 40);
  assert.equal(effectiveDepositPercent(50), 50);
});

test("receipt keys carry the sale id and the email lists every payment", () => {
  assert.equal(saleIdFromReceiptKey("receipt:cmabcdefghijklmnopqrstuv:checkout"), "cmabcdefghijklmnopqrstuv");
  assert.equal(saleIdFromReceiptKey("payer-link:abc"), null);
  const email = saleReceiptEmail({ invoiceNumber: "GH-1", createdAt: new Date("2026-11-14T10:00:00Z"), total: 100000, paidAmount: 100000, branch: { name: "CBD", phone: "+254700000000" }, cashier: { name: "Seller" }, saleItems: [{ quantity: 1, total: 100000, product: { name: "Phone", sku: "P-1" } }], payments: [{ amount: 35000, method: "TRADE_IN" }, { amount: 65000, method: "MPESA", reference: "QK12AB34CD" }] });
  assert.match(email.body, /Trade-in credit: KES 35,000/);
  assert.match(email.body, /M-Pesa QK12AB34CD: KES 65,000/);
  assert.doesNotMatch(email.body, /Balance due/);
});
