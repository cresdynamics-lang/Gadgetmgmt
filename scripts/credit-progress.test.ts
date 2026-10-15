import assert from "node:assert/strict";
import test from "node:test";

import { creditProgress } from "../src/lib/credit-progress";

test("credit progress includes a policy late fee in the total obligation", () => {
  assert.deepEqual(creditProgress(10_000, 7_000, 500), { totalObligation: 10_500, paidToDate: 3_500, percent: 33 });
});

test("credit progress clamps paid amount and percentage to valid bounds", () => {
  assert.deepEqual(creditProgress(10_000, 12_000), { totalObligation: 10_000, paidToDate: 0, percent: 0 });
  assert.deepEqual(creditProgress(10_000, 0, 0), { totalObligation: 10_000, paidToDate: 10_000, percent: 100 });
});
