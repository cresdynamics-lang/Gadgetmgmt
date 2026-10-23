import assert from "node:assert/strict";
import test from "node:test";

import { daysBetween, nairobiDateKey, resolveSalesRange } from "../src/lib/sales-periods";

// 2026-10-24 23:30 in Nairobi is a Saturday, 20:30 UTC.
const lateSaturday = new Date("2026-10-24T20:30:00Z");

test("today uses the Nairobi calendar day", () => {
  const { start, end } = resolveSalesRange("today", lateSaturday);
  assert.equal(start.toISOString(), "2026-10-23T21:00:00.000Z");
  assert.equal(daysBetween(start, end), 1);
});

test("weeks run Monday to Sunday", () => {
  const { start, end } = resolveSalesRange("week", lateSaturday);
  assert.equal(nairobiDateKey(start), "2026-10-19");
  assert.equal(daysBetween(start, end), 7);
});

test("months cover the whole calendar month", () => {
  const { start, end } = resolveSalesRange("month", lateSaturday);
  assert.equal(nairobiDateKey(start), "2026-10-01");
  assert.equal(nairobiDateKey(end), "2026-11-01");
});

test("custom ranges include the end day and accept dates in either order", () => {
  const { start, end } = resolveSalesRange("custom", lateSaturday, "2026-10-10", "2026-10-01");
  assert.equal(nairobiDateKey(start), "2026-10-01");
  assert.equal(daysBetween(start, end), 10);
});
