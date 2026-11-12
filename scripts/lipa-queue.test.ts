import assert from "node:assert/strict";
import test from "node:test";

import { sortLipaPlans } from "../src/lib/lipa-queue";

test("Lipa follow-up puts the latest accounts ahead of the calendar", () => {
  const ordered = sortLipaPlans([
    { id: "active", status: "ACTIVE", nextDueDate: "2026-10-01" },
    { id: "due", status: "DUE", nextDueDate: "2026-11-01" },
    { id: "late3", status: "LATE_3", nextDueDate: "2026-11-12" },
    { id: "recovery", status: "RECOVERY", nextDueDate: "2026-12-01" },
    { id: "late1", status: "LATE_1", nextDueDate: "2026-09-01" },
  ]);
  assert.deepEqual(ordered.map((plan) => plan.id), ["recovery", "late3", "late1", "due", "active"]);
});
