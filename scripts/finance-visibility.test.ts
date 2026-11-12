import assert from "node:assert/strict";
import test from "node:test";

import { canViewFinance, omitSaleCost, presentBusinessInsights, type BusinessInsights } from "../src/lib/finance-visibility";

const insights = {
  period: { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", days: 30 },
  generatedAt: "2026-11-01T00:00:00.000Z",
  sales: {
    current: { salesCount: 4, total: 800000, collected: 700000, units: 5, estimatedGrossProfit: 120000, costCoveragePercent: 80, averageTicket: 200000 },
    previous: { salesCount: 2, total: 400000, collected: 400000, units: 2, estimatedGrossProfit: 50000, costCoveragePercent: 100 },
    totalChangePercent: 100,
    collectedChangePercent: 75,
    profitChangePercent: 140,
    daily: [{ label: "1 Nov", total: 800000 }],
  },
  inventory: {
    stockedProducts: 3,
    attentionCount: 1,
    attention: [{ name: "AirPods", sku: "APP", available: 0, reorderPoint: 2, unitsSold30d: 4, daysOfCover: 0 }],
    topProducts: [{ name: "iPhone", sku: "IP", units: 2, total: 300000 }],
  },
  credit: { activePlans: 6, overdueBalance: 90000, ageBuckets: { notDue: 10000, days1to7: 20000, days8to30: 30000, days31Plus: 40000 } },
} as BusinessInsights;

test("finance figures stay with the owner and are removed for every other role", () => {
  assert.equal(canViewFinance("OWNER"), true);
  assert.equal(canViewFinance("BRANCH_MANAGER"), false);
  const owner = presentBusinessInsights(insights, "OWNER");
  assert.equal(owner.financeVisible, true);
  assert.equal(owner.sales.current.total, 800000);
  assert.equal(owner.sales.current.estimatedGrossProfit, 120000);
  assert.equal(owner.credit.overdueBalance, 90000);

  for (const role of ["BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]) {
    const presented = presentBusinessInsights(insights, role);
    assert.equal(presented.financeVisible, false);
    assert.equal(presented.sales.current.salesCount, 4);
    assert.equal(presented.sales.current.units, 5);
    assert.equal(presented.sales.current.total, null);
    assert.equal(presented.sales.current.collected, null);
    assert.equal(presented.sales.current.estimatedGrossProfit, null);
    assert.equal(presented.sales.previous.total, null);
    assert.equal(presented.sales.daily[0]?.total, null);
    assert.equal(presented.inventory.topProducts[0]?.total, null);
    assert.equal(presented.inventory.topProducts[0]?.units, 2);
    assert.equal(presented.credit.activePlans, 6);
    assert.equal(presented.credit.overdueBalance, null);
    assert.equal(presented.credit.ageBuckets, null);
    assert.equal(JSON.stringify(presented).includes("800000"), false);
    assert.equal(JSON.stringify(presented).includes("90000"), false);
  }
});

test("sale responses drop unit cost for staff", () => {
  const sale = { id: "sale", saleItems: [{ quantity: 1, unitPrice: 50000, unitCost: 41000, total: 50000 }] };
  assert.equal(omitSaleCost(sale, "OWNER").saleItems[0]?.unitCost, 41000);
  const staff = omitSaleCost(sale, "CASHIER");
  assert.equal("unitCost" in (staff.saleItems[0] ?? {}), false);
  assert.equal(staff.saleItems[0]?.unitPrice, 50000);
});
