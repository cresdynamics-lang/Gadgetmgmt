import assert from "node:assert/strict";
import test from "node:test";

import {
  activationAllowsStock,
  categoryTracksUnits,
  claimFromIdentifier,
  imeiChecksumValid,
  maskImei,
  normalizeSerial,
  stockDeltas,
  tracksUnits,
  unidentifiedSellable,
} from "../src/lib/device-units";

function imeiFrom(base14: string) {
  let sum = 0;
  for (let index = 0; index < base14.length; index += 1) {
    let digit = Number(base14[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return `${base14}${(10 - (sum % 10)) % 10}`;
}

test("accepts a 15-digit IMEI only when the Luhn check digit matches", () => {
  const valid = imeiFrom("49015420323751");
  assert.equal(valid.length, 15);
  assert.equal(imeiChecksumValid(valid), true);
  assert.equal(imeiChecksumValid(`${valid.slice(0, 14)}${(Number(valid[14]) + 1) % 10}`), false);
  assert.equal(imeiChecksumValid("12345"), false);
  assert.equal(imeiChecksumValid("4901542032375188"), false);
});

test("phones and laptops are tracked per device, accessories by quantity", () => {
  assert.equal(categoryTracksUnits("Smartphone"), true);
  assert.equal(categoryTracksUnits("Laptop"), true);
  assert.equal(categoryTracksUnits("Tablet"), true);
  assert.equal(categoryTracksUnits("Phone Cases"), false);
  assert.equal(categoryTracksUnits("Charger"), false);
  assert.equal(categoryTracksUnits("Headphones"), false);
  assert.equal(tracksUnits("Smartphone", null), true);
  assert.equal(tracksUnits("Smartphone", false), false);
  assert.equal(tracksUnits("Power bank", true), true);
  assert.equal(tracksUnits("Accessory", null), false);
});

test("masks IMEIs and refuses a sellable device while activation lock is on", () => {
  const imei = imeiFrom("35693803564380");
  assert.match(maskImei(imei), /^3569 •••• \d{3}$/);
  assert.equal(maskImei(imei).includes(imei), false);
  assert.equal(activationAllowsStock("USED", "UNKNOWN"), false);
  assert.equal(activationAllowsStock("USED", "OFF"), true);
  assert.equal(activationAllowsStock("NEW", "ON"), false);
  assert.equal(activationAllowsStock("NEW", "UNKNOWN"), true);
  assert.equal(normalizeSerial("ab-12"), "AB-12");
  assert.equal(normalizeSerial("a"), null);
});

test("stock moves keep repair and returns out of the sellable count", () => {
  assert.deepEqual(stockDeltas("IN_STOCK", "IN_REPAIR"), { stockOnHand: -1, reservedStock: 0 });
  assert.deepEqual(stockDeltas("IN_REPAIR", "IN_STOCK"), { stockOnHand: 1, reservedStock: 0 });
  assert.deepEqual(stockDeltas("IN_STOCK", "RESERVED"), { stockOnHand: 0, reservedStock: 1 });
  assert.deepEqual(stockDeltas("RESERVED", "IN_STOCK"), { stockOnHand: 0, reservedStock: -1 });
  assert.equal(stockDeltas("SOLD", "IN_STOCK"), null);
  assert.equal(unidentifiedSellable(5, 1, 3), 1);
  assert.equal(unidentifiedSellable(2, 0, 2), 0);
});

test("a typed IMEI matches an in-stock device before it is treated as a new identifier", () => {
  const imei = imeiFrom("35391805234567");
  const known = [{ id: "unit-1", imei, imei2: null, serialNumber: "SN-100" }];
  assert.deepEqual(claimFromIdentifier(imei, known), { stockUnitId: "unit-1" });
  assert.deepEqual(claimFromIdentifier("sn-100", known), { stockUnitId: "unit-1" });
  assert.deepEqual(claimFromIdentifier(imeiFrom("35391805234568"), []), { imei: imeiFrom("35391805234568") });
  assert.equal(claimFromIdentifier("123456789012345", []), null);
  assert.deepEqual(claimFromIdentifier("C02-ABCD", []), { serialNumber: "C02-ABCD" });
});
