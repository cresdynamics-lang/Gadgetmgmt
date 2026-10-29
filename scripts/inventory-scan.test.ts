import assert from "node:assert/strict";
import test from "node:test";

import { matchScanProducts, parseScanPayload } from "../src/lib/inventory-scan";

const products = [
  {
    id: "new1",
    sku: "WEB-IPAD-PRO-11-M5-256GB-CELL-NEW",
    name: "iPad Pro 11\" M5 256GB 5G",
    category: "iPad",
    brand: "Apple",
    condition: "NEW",
    colour: "Silver",
    imei: null,
    websiteProductId: "ipad-pro-11-m5",
    websiteVariantKey: "256gb-cell",
  },
  {
    id: "ex1",
    sku: "WEB-IPAD-PRO-11-M5-256GB-CELL-EX-UK",
    name: "iPad Pro 11\" M5 256GB 5G",
    category: "iPad",
    brand: "Apple",
    condition: "EX_UK",
    colour: "Silver",
    imei: null,
    websiteProductId: "ipad-pro-11-m5",
    websiteVariantKey: "256gb-cell",
  },
  {
    id: "phone1",
    sku: "IPHONE-16-PRO-256-NEW",
    name: "iPhone 16 Pro 256GB",
    category: "iPhone",
    brand: "Apple",
    condition: "NEW",
    colour: "Desert Titanium",
    imei: "490154203237518",
    websiteProductId: null,
    websiteVariantKey: null,
  },
];

test("parseScanPayload reads IMEI, GS1 GTIN and SKU", () => {
  assert.deepEqual(parseScanPayload(" 490154203237518 "), { code: "490154203237518", kind: "imei" });
  assert.deepEqual(parseScanPayload("(01)01234567890128"), { code: "01234567890128", kind: "gtin" });
  assert.equal(parseScanPayload("WEB-IPAD-PRO-11-M5-256GB-CELL-NEW").kind, "sku");
});

test("scan matches an IMEI to the exact phone", () => {
  const hits = matchScanProducts("490154203237518", products);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.product.id, "phone1");
  assert.equal(hits[0]?.reason, "imei");
});

test("scan matches a SKU and website listing id", () => {
  const skuHits = matchScanProducts("WEB-IPAD-PRO-11-M5-256GB-CELL-NEW", products);
  assert.equal(skuHits.length, 1);
  assert.equal(skuHits[0]?.product.id, "new1");

  const listingHits = matchScanProducts("ipad-pro-11-m5::256gb-cell", products);
  assert.equal(listingHits.length, 2);
  assert.deepEqual(listingHits.map((hit) => hit.product.condition).sort(), ["EX_UK", "NEW"]);
});

test("partial SKU still finds the product when it is unique enough", () => {
  const hits = matchScanProducts("256GB-CELL-NEW", products);
  assert.equal(hits[0]?.product.id, "new1");
  assert.equal(hits[0]?.reason, "skuContains");
});

test("a typed product name matches even with spaces and hyphens", () => {
  const exact = matchScanProducts("iPad Pro 11\" M5 256GB 5G", products);
  assert.equal(exact.length, 2);
  assert.deepEqual(exact.map((hit) => hit.product.condition).sort(), ["EX_UK", "NEW"]);

  const unique = matchScanProducts("iPhone 16 Pro 256GB", products);
  assert.equal(unique.length, 1);
  assert.equal(unique[0]?.product.id, "phone1");
  assert.equal(unique[0]?.reason, "name");
});

test("a compact SKU typed without hyphens still matches", () => {
  const hits = matchScanProducts("iphone16pro256new", products);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.product.id, "phone1");
});
