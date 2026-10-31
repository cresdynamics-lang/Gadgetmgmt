import assert from "node:assert/strict";
import test from "node:test";

import { deviceIdentifiers, planUnitAllocation, scansRequired } from "../src/lib/device-units";

const units = [
  { id: "a", imei: "358250492399182", serial: "V2WT7T6GVM" },
  { id: "b", imei: "358250492399190", serial: null },
  { id: "c", imei: null, serial: "C02XK1ABJG5H" },
];

test("splits IMEIs from serials", () => {
  assert.deepEqual(deviceIdentifiers({ imei: "35 8250 4923 99182" }), { imei: "358250492399182", serial: null });
  assert.deepEqual(deviceIdentifiers({ imei: "c02xk1abjg5h" }), { imei: null, serial: "C02XK1ABJG5H" });
  assert.deepEqual(deviceIdentifiers({ imei: "358250492399182", serial: "V2WT7T6GVM" }), { imei: "358250492399182", serial: "V2WT7T6GVM" });
  assert.deepEqual(deviceIdentifiers({ imei: "123" }), { imei: null, serial: null });
});

test("a single Ex-UK phone is picked without a scan", () => {
  const plan = planUnitAllocation({ quantity: 1, stockOnHand: 1, activeUnits: 1, tracked: [units[0]], scanned: [] });
  assert.deepEqual(plan, { ok: true, unitIds: ["a"] });
  assert.equal(scansRequired({ quantity: 1, untracked: 0, tracked: 1 }), 0);
});

test("several New phones of one model need the sold one scanned", () => {
  const plan = planUnitAllocation({ quantity: 1, stockOnHand: 3, activeUnits: 3, tracked: units, scanned: [] });
  assert.deepEqual(plan, { ok: false, reason: "missing", missing: 1 });
  assert.equal(scansRequired({ quantity: 1, untracked: 0, tracked: 3 }), 1);
  assert.deepEqual(planUnitAllocation({ quantity: 1, stockOnHand: 3, activeUnits: 3, tracked: units, scanned: ["V2WT7T6GVM"] }), { ok: true, unitIds: ["a"] });
});

test("stock received before tracking can still be sold by quantity", () => {
  const plan = planUnitAllocation({ quantity: 2, stockOnHand: 5, activeUnits: 1, tracked: [units[1]], scanned: [] });
  assert.deepEqual(plan, { ok: true, unitIds: [] });
  assert.equal(scansRequired({ quantity: 2, untracked: 4, tracked: 1 }), 0);
});

test("selling past the untracked stock needs the remaining phones", () => {
  const plan = planUnitAllocation({ quantity: 3, stockOnHand: 4, activeUnits: 3, tracked: units, scanned: ["358250492399190"] });
  assert.deepEqual(plan, { ok: false, reason: "missing", missing: 1 });
});

test("rejects a phone that is not in stock for this item", () => {
  assert.deepEqual(planUnitAllocation({ quantity: 1, stockOnHand: 3, activeUnits: 3, tracked: units, scanned: ["999999999999999"] }), { ok: false, reason: "unknown", code: "999999999999999" });
  assert.deepEqual(planUnitAllocation({ quantity: 1, stockOnHand: 3, activeUnits: 3, tracked: units, scanned: ["358250492399182", "358250492399190"] }), { ok: false, reason: "too_many" });
});
