import assert from "node:assert/strict";
import test from "node:test";

import { listingKey, websiteCatalogListings, websiteCatalogSku } from "../src/lib/website-catalog";
import { canAccessPage, hasPermission, resolvePermissions } from "../src/lib/access";

test("ex-uk sku is distinct from the new sku for the same listing", () => {
  const listing = websiteCatalogListings[0];
  assert.ok(listing);
  assert.notEqual(websiteCatalogSku(listing, "NEW"), websiteCatalogSku(listing, "EX_UK"));
  assert.match(websiteCatalogSku(listing, "EX_UK"), /-EX-UK$/);
});

test("every website listing has a unique sku and product/variant pair", () => {
  const skus = websiteCatalogListings.map(websiteCatalogSku);
  const keys = websiteCatalogListings.map(listingKey);
  assert.equal(new Set(skus).size, skus.length);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(websiteCatalogListings.length >= 50);
  assert.ok(websiteCatalogListings.every((row) => row.priceKes > 0 && Number.isInteger(row.priceKes)));
});

test("listed iPad Pro 11 M5 256GB 5G is 188000", () => {
  const row = websiteCatalogListings.find((item) => item.websiteProductId === "ipad-pro-11-m5" && item.websiteVariantKey === "256gb-cell");
  assert.equal(row?.priceKes, 188000);
});

test("MacBook Neo 13 8/256 is 100000 and Air 15 24/1TB uses the later 310000 price", () => {
  const neo = websiteCatalogListings.find((item) => item.websiteProductId === "macbook-neo-13" && item.websiteVariantKey === "8gb-256gb");
  const air15 = websiteCatalogListings.find((item) => item.websiteProductId === "macbook-air-15-m5" && item.websiteVariantKey === "24gb-1tb");
  assert.equal(neo?.priceKes, 100000);
  assert.equal(air15?.priceKes, 310000);
});

test("older iPads that were not on the new price list are not auto-listed", () => {
  assert.equal(
    websiteCatalogListings.some((row) => row.websiteProductId === "ipad-pro-11-m4"),
    false,
  );
  assert.equal(
    websiteCatalogListings.filter((row) => row.category === "iPad").length,
    22,
  );
});

test("owners and managers can open the website catalog; cashiers cannot", () => {
  const owner = { role: "OWNER", ...resolvePermissions("OWNER", [], []) };
  const manager = { role: "BRANCH_MANAGER", ...resolvePermissions("BRANCH_MANAGER", [], []) };
  const cashier = { role: "CASHIER", ...resolvePermissions("CASHIER", [], []) };
  assert.equal(hasPermission(owner, "website.view"), true);
  assert.equal(canAccessPage(manager, "/website"), true);
  assert.equal(canAccessPage(cashier, "/website"), false);
});
