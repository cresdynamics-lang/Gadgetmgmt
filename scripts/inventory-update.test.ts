import assert from "node:assert/strict";
import test from "node:test";

import { catalogSiblingSku, groupWebsiteUpdateRows, siblingSku } from "../src/lib/inventory-update";

const products = [
  {
    id: "n1",
    sku: "WEB-IPAD-PRO-11-M5-256GB-CELL-NEW",
    name: "iPad Pro 11\" M5 256GB 5G",
    category: "iPad",
    condition: "NEW",
    colour: "Silver",
    configuration: "256GB · 5G",
    productGroup: "iPad Pro 11\" M5",
    sellingPrice: 188000,
    showOnWebsite: true,
    websiteProductId: "ipad-pro-11-m5",
    websiteVariantKey: "256gb-cell",
    stockOnHand: 4,
    reservedStock: 1,
  },
  {
    id: "n1b",
    sku: "WEB-IPAD-PRO-11-M5-256GB-CELL-NEW-SPACE",
    name: "iPad Pro 11\" M5 256GB 5G",
    category: "iPad",
    condition: "NEW",
    colour: "Space Black",
    configuration: "256GB · 5G",
    productGroup: "iPad Pro 11\" M5",
    sellingPrice: 188000,
    showOnWebsite: false,
    websiteProductId: "ipad-pro-11-m5",
    websiteVariantKey: "256gb-cell",
    stockOnHand: 2,
    reservedStock: 0,
  },
  {
    id: "e1",
    sku: "WEB-IPAD-PRO-11-M5-256GB-CELL-EX-UK",
    name: "iPad Pro 11\" M5 256GB 5G",
    category: "iPad",
    condition: "EX_UK",
    colour: "Silver",
    configuration: "256GB · 5G",
    productGroup: "iPad Pro 11\" M5",
    sellingPrice: 165000,
    showOnWebsite: true,
    websiteProductId: "ipad-pro-11-m5",
    websiteVariantKey: "256gb-cell",
    stockOnHand: 1,
    reservedStock: 0,
  },
  {
    id: "trade",
    sku: "TRADE-1",
    name: "Trade-in phone",
    category: "iPhone",
    condition: "TRADE_IN",
    colour: null,
    configuration: null,
    productGroup: null,
    sellingPrice: 40000,
    showOnWebsite: false,
    websiteProductId: null,
    websiteVariantKey: null,
    stockOnHand: 1,
    reservedStock: 0,
  },
];

test("groups New and Ex-UK of the same website listing onto one update row", () => {
  const rows = groupWebsiteUpdateRows(products);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.websiteProductId, "ipad-pro-11-m5");
  assert.equal(rows[0]?.option, "256GB · 5G");
  assert.equal(rows[0]?.new?.sellingPrice, 188000);
  assert.equal(rows[0]?.exUk?.sellingPrice, 165000);
  assert.equal(rows[0]?.new?.available, 5);
  assert.equal(rows[0]?.new?.showOnWebsite, true);
  assert.deepEqual(rows[0]?.new?.productIds, ["n1", "n1b"]);
});

test("sibling sku flips NEW and EX-UK suffixes and uses the website catalog sku when mapped", () => {
  assert.equal(siblingSku("WEB-IPAD-A16-128GB-NEW", "EX_UK"), "WEB-IPAD-A16-128GB-EX-UK");
  assert.equal(siblingSku("IPHONE-16-PRO", "EX_UK"), "IPHONE-16-PRO-EX-UK");
  assert.equal(
    catalogSiblingSku("ipad-pro-11-m5", "256gb-cell", "anything", "EX_UK"),
    "WEB-IPAD-PRO-11-M5-256GB-CELL-EX-UK",
  );
});
