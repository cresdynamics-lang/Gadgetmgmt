import assert from "node:assert/strict";
import test from "node:test";

import {
  appleModelKey,
  isAppleMpn,
  lookupAppleIdentity,
  nameMatchesAppleGroup,
  suggestedConditionFromMpn,
} from "../src/lib/apple-barcodes";
import { matchScanProducts, parseScanPayload } from "../src/lib/inventory-scan";

test("Apple box scans are parsed as model, part number, GTIN or serial", () => {
  assert.deepEqual(parseScanPayload("A3523"), { code: "A3523", kind: "model" });
  assert.deepEqual(parseScanPayload("MG8G4ZA/A"), { code: "MG8G4ZA/A", kind: "mpn" });
  assert.deepEqual(parseScanPayload("SABCDEF12GH"), { code: "ABCDEF12GH", kind: "serial" });
  assert.equal(parseScanPayload("194253398401").kind, "gtin");
  assert.equal(isAppleMpn("MRY63LL/A"), true);
  assert.equal(suggestedConditionFromMpn("FTR53LL/A"), "EX_UK");
  assert.equal(suggestedConditionFromMpn("MRY63LL/A"), "NEW");
});

test("Apple A-numbers resolve to the shop listing group for New and Ex-UK", () => {
  assert.equal(lookupAppleIdentity("A3523")?.group, "iPhone 17 Pro");
  assert.equal(lookupAppleIdentity("A3258")?.group, "iPhone 17");
  assert.equal(lookupAppleIdentity("A3293")?.group, "iPhone 16 Pro");
  assert.equal(lookupAppleIdentity("A2633")?.group, "iPhone 13");
  assert.equal(lookupAppleIdentity("A2221")?.group, "iPhone 11");
  assert.equal(lookupAppleIdentity("A3064")?.group, "AirPods Pro 3");
  assert.equal(lookupAppleIdentity("A3064")?.websiteProductId, "airpods-pro-3");
});

test("iPhone 11 does not match iPhone 11 Pro", () => {
  assert.equal(appleModelKey("iPhone 11 64GB (Ex-UK)"), "iphone 11");
  assert.equal(appleModelKey("iPhone 11 Pro 256GB"), "iphone 11 pro");
  assert.equal(nameMatchesAppleGroup("iPhone 11 Pro 256GB", "iPhone 11"), false);
  assert.equal(nameMatchesAppleGroup("iPhone 17 Pro Max 256GB", "iPhone 17 Pro"), false);
  assert.equal(nameMatchesAppleGroup("iPhone 17 Pro 256GB", "iPhone 17 Pro"), true);
});

const stock = [
  {
    id: "n17",
    sku: "NEW-IPHONE-17-PRO-256GB",
    name: "iPhone 17 Pro 256GB",
    category: "iPhone",
    brand: "Apple",
    condition: "NEW",
    colour: null,
    imei: null,
    gtin: "01942533984018",
    mpn: "MG8G4ZA/A",
    productGroup: "iPhone 17 Pro",
    websiteProductId: null,
    websiteVariantKey: null,
  },
  {
    id: "x17",
    sku: "EXUK-IPHONE-17-PRO-256GB",
    name: "iPhone 17 Pro 256GB (Ex-UK)",
    category: "iPhone",
    brand: "Apple",
    condition: "EX_UK",
    colour: null,
    imei: null,
    productGroup: "iPhone 17 Pro",
    websiteProductId: null,
    websiteVariantKey: null,
  },
  {
    id: "n11",
    sku: "EXUK-IPHONE-11-128GB",
    name: "iPhone 11 128GB (Ex-UK)",
    category: "iPhone",
    brand: "Apple",
    condition: "EX_UK",
    colour: null,
    imei: null,
    productGroup: "iPhone 11",
    websiteProductId: null,
    websiteVariantKey: null,
  },
];

test("scanning an Apple model number returns the New or Ex-UK row the staff marked", () => {
  const both = matchScanProducts("A3523", stock);
  assert.deepEqual(both.map((hit) => hit.product.id).sort(), ["n17", "x17"]);

  const onlyNew = matchScanProducts("A3523", stock, { condition: "NEW" });
  assert.equal(onlyNew.length, 1);
  assert.equal(onlyNew[0]?.product.id, "n17");

  const onlyEx = matchScanProducts("A3523", stock, { condition: "EX_UK" });
  assert.equal(onlyEx.length, 1);
  assert.equal(onlyEx[0]?.product.id, "x17");
});

test("a stored box GTIN or part number matches the product it was attached to", () => {
  const gtinHits = matchScanProducts("1942533984018", stock, { condition: "NEW" });
  assert.equal(gtinHits[0]?.product.id, "n17");
  assert.equal(gtinHits[0]?.reason, "gtin");

  const mpnHits = matchScanProducts("MG8G4ZA/A", stock, { condition: "NEW" });
  assert.equal(mpnHits[0]?.product.id, "n17");
  assert.equal(mpnHits[0]?.reason, "mpn");
});

test("an iPhone 11 model scan does not receive iPhone 17 Pro stock", () => {
  const hits = matchScanProducts("A2221", stock, { condition: "EX_UK" });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.product.id, "n11");
});
