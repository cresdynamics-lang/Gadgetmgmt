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
  const skus = websiteCatalogListings.map((row) => websiteCatalogSku(row));
  const keys = websiteCatalogListings.map(listingKey);
  assert.equal(new Set(skus).size, skus.length);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(websiteCatalogListings.length >= 50);
  assert.ok(websiteCatalogListings.every((row) => row.websiteProductId && row.websiteVariantKey));
});

test("AirPods Max stays in ops but is not listed on the public site", () => {
  const row = websiteCatalogListings.find((item) => item.websiteProductId === "airpods-max-2");
  assert.equal(row?.listed, false);
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
