import assert from "node:assert/strict";
import test from "node:test";

import { creditStatusForDays, daysUntilDue, reminderMilestone } from "../src/lib/credit-lifecycle";

test("credit lifecycle uses EAT calendar days, not current time-of-day", () => {
  const dueAtMidnightUtc = new Date("2026-10-14T00:00:00.000Z");
  const beforeEATMidnight = new Date("2026-10-13T20:59:00.000Z");
  const onDueDayEAT = new Date("2026-10-13T21:01:00.000Z");
  assert.equal(daysUntilDue(dueAtMidnightUtc, beforeEATMidnight), 1);
  assert.equal(daysUntilDue(dueAtMidnightUtc, onDueDayEAT), 0);
});

test("credit lifecycle observes due, configured grace, and escalation stages", () => {
  assert.equal(creditStatusForDays(4, 3), "ACTIVE");
  assert.equal(creditStatusForDays(3, 3), "DUE_SOON");
  assert.equal(creditStatusForDays(0, 3), "DUE");
  assert.equal(creditStatusForDays(-2, 3), "GRACE");
  assert.equal(creditStatusForDays(-3, 3), "LATE_1");
  assert.equal(creditStatusForDays(-4, 3), "LATE_1");
  assert.equal(creditStatusForDays(-7, 3), "LATE_2");
  assert.equal(creditStatusForDays(-10, 3), "LATE_3");
  assert.equal(creditStatusForDays(-17, 3), "RECOVERY");
});

test("zero-day grace moves directly from due into late stages", () => {
  assert.equal(creditStatusForDays(0, 0), "DUE");
  assert.equal(creditStatusForDays(-1, 0), "LATE_1");
});

test("customers are reminded 3 days before and on the due day only", () => {
  assert.equal(reminderMilestone(7), null);
  assert.equal(reminderMilestone(3), "before-3-days");
  assert.equal(reminderMilestone(2), null);
  assert.equal(reminderMilestone(0), "due-today");
  assert.equal(reminderMilestone(-3), null);
});
