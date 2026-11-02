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

test("Macs and iPads are recognised by model number, part number and name", () => {
  assert.equal(lookupAppleIdentity("A2337")?.group, 'MacBook Air 13" M1');
  assert.equal(lookupAppleIdentity("A2337")?.category, "Mac");
  assert.equal(lookupAppleIdentity("MGN63LL/A")?.group, 'MacBook Air 13" M1');
  assert.equal(lookupAppleIdentity("FGN63LL/A")?.group, 'MacBook Air 13" M1');
  assert.equal(lookupAppleIdentity("A2681")?.group, 'MacBook Air 13" M2');
  assert.equal(lookupAppleIdentity("A2338")?.group, 'MacBook Pro 13" M1/M2');
  assert.equal(lookupAppleIdentity("Apple MacBook Pro A2338 M2 512GB")?.group, 'MacBook Pro 13" M2');
  assert.equal(lookupAppleIdentity("A2442 M1 Max")?.group, 'MacBook Pro 14" M1 Max');
  assert.equal(lookupAppleIdentity("A2902")?.group, 'iPad Air 11" M2');
  assert.equal(lookupAppleIdentity("A3354")?.group, "iPad (A16)");
  assert.equal(lookupAppleIdentity("A3354")?.category, "iPad");
  assert.equal(lookupAppleIdentity("MacBook Air 15-inch M3 Starlight")?.group, 'MacBook Air 15" M3');
  assert.equal(lookupAppleIdentity("iPad Pro 11 inch M4")?.group, 'iPad Pro 11" M4');
  assert.equal(lookupAppleIdentity("Mac mini M2")?.category, "Mac");
  assert.equal(lookupAppleIdentity("A3472")?.group, "iPhone 18 Pro");
});

test("a part number or serial not on the list is not guessed to be an iPhone", () => {
  assert.equal(lookupAppleIdentity("ZZZZ1LL/A"), null);
  assert.equal(lookupAppleIdentity("C02XK1ABJG5H"), null);
  assert.equal(lookupAppleIdentity("HA1234XYZ9"), null);
});

test("shop names match scans whatever way the size is written", () => {
  assert.equal(nameMatchesAppleGroup("MacBook Air 13 M3", 'MacBook Air 13" M3'), true);
  assert.equal(nameMatchesAppleGroup("MacBook Air 13 M3", 'MacBook Air 15" M3'), false);
  assert.equal(nameMatchesAppleGroup("MacBook Air 13 M3", 'MacBook Air 13" M2'), false);
  assert.equal(nameMatchesAppleGroup("MacBook Pro 13 M2", 'MacBook Pro 13" M1/M2'), true);
  assert.equal(nameMatchesAppleGroup("MacBook Pro 14 M3 Max 1TB", 'MacBook Pro 14" M3 Pro/Max'), true);
  assert.equal(nameMatchesAppleGroup("MacBook Pro 14 M3", 'MacBook Pro 14" M3 Pro/Max'), false);
  assert.equal(nameMatchesAppleGroup('iPad Pro 11" M5 256GB 5G', 'iPad Pro 11" M5'), true);
  assert.equal(nameMatchesAppleGroup("iPad Air M2", 'iPad Air 11" M2'), true);
  assert.equal(nameMatchesAppleGroup("iPad mini (6th gen)", "iPad mini (A17 Pro)"), true);
});
