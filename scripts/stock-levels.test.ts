import assert from "node:assert/strict";
import test from "node:test";

import { needsReorder, reorderThreshold } from "../src/lib/stock-levels";

test("zero reorder points do not create alerts for untracked catalog rows", () => {
  assert.equal(reorderThreshold(0, 0), 0);
  assert.equal(needsReorder(0, 0, 0), false);
});

test("configured branch and product thresholds alert at or below their effective minimum", () => {
  assert.equal(reorderThreshold(4, 8), 8);
  assert.equal(needsReorder(8, 4, 8), true);
  assert.equal(needsReorder(9, 4, 8), false);
  assert.equal(needsReorder(-1, 4, 0), true);
});
