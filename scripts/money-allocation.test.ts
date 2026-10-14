import assert from "node:assert/strict";
import test from "node:test";
import { proportionalIntegerShare } from "../src/lib/money-allocation";

test("allocates normal amounts by integer proportion", () => {
  assert.equal(proportionalIntegerShare(100, 1, 3), 33);
  assert.equal(proportionalIntegerShare(100, 2, 3), 66);
});

test("keeps large multiplication exact above Number safe-product range", () => {
  assert.equal(proportionalIntegerShare(2_000_000_000, 2_000_000_000, 2_147_483_647), 1_862_645_150);
});

test("rejects invalid allocation weights", () => {
  assert.throws(() => proportionalIntegerShare(100, 101, 100), RangeError);
  assert.throws(() => proportionalIntegerShare(-1, 1, 2), RangeError);
  assert.throws(() => proportionalIntegerShare(1, 1, 0), RangeError);
});