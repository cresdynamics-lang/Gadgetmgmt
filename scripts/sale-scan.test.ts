import assert from "node:assert/strict";
import test from "node:test";

import { matchSaleScan, type ScannableProduct } from "../src/lib/sale-scan";

const catalogue: ScannableProduct[] = [
  {
    id: "phone",
    sku: "IP15-256",
    name: "iPhone 15 256GB",
    available: 1,
    devices: [{ id: "unit-1", imei: "490154203237518", imei2: null, serialNumber: "F2LXABC123" }],
  },
  { id: "case", sku: "CASE-CLR", name: "Clear case", available: 4 },
  { id: "sold", sku: "IP14-128", name: "iPhone 14 128GB", available: 0, devices: [{ id: "unit-2", imei: "353918052345678", imei2: null, serialNumber: null }] },
];

test("a scanned IMEI or serial selects the in-stock device", () => {
  assert.deepEqual(matchSaleScan(catalogue, { imei: "490154203237518" }), { status: "device", productId: "phone", identifier: "490154203237518" });
  assert.deepEqual(matchSaleScan(catalogue, { serialNumber: "f2lxabc123" }), { status: "device", productId: "phone", identifier: "f2lxabc123" });
});

test("a scanned SKU adds the product and refuses stock that is already gone", () => {
  assert.deepEqual(matchSaleScan(catalogue, { productCode: "case-clr" }), { status: "sku", productId: "case" });
  assert.deepEqual(matchSaleScan(catalogue, { raw: "IP15-256" }), { status: "sku", productId: "phone" });
  assert.deepEqual(matchSaleScan(catalogue, { imei: "353918052345678" }), { status: "unavailable", name: "iPhone 14 128GB" });
  assert.deepEqual(matchSaleScan(catalogue, { raw: "UNKNOWN" }), { status: "unknown" });
});
