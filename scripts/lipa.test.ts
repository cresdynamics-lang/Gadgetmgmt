import assert from "node:assert/strict";
import test from "node:test";
import { lipaFromDeposit, lipaPlan, splitInstallments } from "../src/lib/lipa";

test("iPhone 17 Pro at 158,000 on 6 months", () => {
  const plan = lipaPlan(158_000, 40, 6);
  assert.equal(plan.depositKes, 63_200);
  assert.equal(plan.balanceKes, 94_800);
  assert.equal(plan.rate, 1.8);
  // 94,800 × 1.8 = 170,640, rounded to the nearest hundred.
  assert.equal(plan.repayKes, 170_600);
  assert.equal(plan.monthlyKes, 28_433);
  assert.equal(plan.totalKes, 233_800);
  const collected = lipaFromDeposit(158_000, 63_200, 6);
  assert.deepEqual(collected, plan);
  const months = splitInstallments(plan.repayKes, 6);
  assert.equal(months.reduce((sum, amount) => sum + amount, 0), 170_600);
  assert.equal(months.length, 6);
});

test("each month uses its own rate, and month 6 is the longest plan", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((months) => lipaPlan(158_000, 40, months).repayKes),
    [123_200, 132_700, 142_200, 151_700, 161_200, 170_600],
  );
  assert.equal(lipaPlan(158_000, 40, 12).months, 6);
  assert.equal(lipaPlan(130_000, 40, 3).repayKes, 117_000);
});
