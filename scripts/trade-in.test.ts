import assert from "node:assert/strict";
import test from "node:test";

import { assessTradeIn, ownershipProofFrom, tradeInChecks, type TradeInAssessmentInput } from "../src/lib/trade-in";

const allChecks = Object.fromEntries(tradeInChecks.map((check) => [check.id, true]));
const passing: TradeInAssessmentInput = {
  deviceType: "iPhone", model: "iPhone 13", serial: "356789012345678", storage: "128GB", grade: "GOOD",
  batteryHealth: 88, ownershipProof: "RECEIPT", checks: allChecks, sellerName: "Jane Wanjiku", sellerPhone: "0712345678",
  value: 40000, resalePrice: 55000, staffConfirmed: true,
};

test("a device that meets every criterion is eligible", () => {
  const result = assessTradeIn(passing);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.warnings, []);
});

test("activation lock, proof of ownership and faulty condition each block a trade-in", () => {
  assert.equal(assessTradeIn({ ...passing, checks: { ...allChecks, lockRemoved: false } }).eligible, false);
  assert.equal(assessTradeIn({ ...passing, ownershipProof: "" }).eligible, false);
  assert.equal(assessTradeIn({ ...passing, grade: "FAULTY" }).eligible, false);
});

test("the trade-in value must leave a margin on resale", () => {
  assert.equal(assessTradeIn({ ...passing, value: 55000 }).eligible, false);
});

test("low battery health warns but does not block", () => {
  const result = assessTradeIn({ ...passing, batteryHealth: 74 });
  assert.equal(result.eligible, true);
  assert.equal(result.warnings.length, 1);
});

test("AirPods need no storage or battery figure", () => {
  const result = assessTradeIn({ ...passing, deviceType: "AirPods", model: "AirPods Pro 2", serial: "GX7HJ2K3L9", storage: null, batteryHealth: null });
  assert.equal(result.eligible, true);
});

test("the cashier must sign the declaration before a trade-in is accepted", () => {
  const result = assessTradeIn({ ...passing, staffConfirmed: false });
  assert.equal(result.eligible, false);
  assert.match(result.blockers.join(" "), /declaration/);
});

test("proof of ownership comes from the receipt and box tick boxes", () => {
  assert.equal(ownershipProofFrom(true, true), "BOTH");
  assert.equal(ownershipProofFrom(false, true), "BOX");
  assert.equal(ownershipProofFrom(false, false), "");
});
