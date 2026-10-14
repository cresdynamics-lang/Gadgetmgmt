import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type InsightScope = { branchId?: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const roundKes = (value: number) => Math.round(value);

export async function getBusinessInsights(scope: InsightScope, now = new Date()) {
  const currentStart = new Date(now.getTime() - 30 * DAY_MS);
  const previousStart = new Date(now.getTime() - 60 * DAY_MS);
  const salesWhere: Prisma.SaleWhereInput = {
    ...scope,
    status: { in: ["PAID", "PARTIAL"] },
    createdAt: { gte: previousStart },
  };

  const [sales, inventory, plans] = await Promise.all([
    prisma.sale.findMany({
      where: salesWhere,
      select: {
        total: true,
        paidAmount: true,
        createdAt: true,
        saleItems: {
          select: {
            quantity: true,
            total: true,
            unitCost: true,
            product: { select: { name: true, sku: true } },
          },
        },
      },
    }),
    prisma.inventoryItem.findMany({
      where: scope,
      select: {
        stockOnHand: true,
        reservedStock: true,
        reorderLevel: true,
        product: { select: { name: true, sku: true, reorderLevel: true } },
      },
    }),
    prisma.creditPlan.findMany({
      where: { ...scope, balance: { gt: 0 }, status: { not: "PAID_OFF" } },
      select: {
        balance: true,
        installments: { select: { amount: true, paidAmount: true, dueDate: true } },
      },
    }),
  ]);

  const currentSales = sales.filter((sale) => sale.createdAt >= currentStart);
  const previousSales = sales.filter((sale) => sale.createdAt < currentStart);
  const summarizeSales = (periodSales: typeof sales) => {
    const total = periodSales.reduce((sum, sale) => sum + sale.total, 0);
    const collected = periodSales.reduce((sum, sale) => sum + sale.paidAmount, 0);
    const items = periodSales.flatMap((sale) => sale.saleItems);
    const units = items.reduce((sum, item) => sum + item.quantity, 0);
    const costedItems = items.filter((item) => item.unitCost > 0);
    const costedUnits = costedItems.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedGrossProfit = costedItems.length ? costedItems.reduce((sum, item) => sum + item.total - item.unitCost * item.quantity, 0) : null;
    return {
      salesCount: periodSales.length,
      total,
      collected,
      units,
      estimatedGrossProfit,
      costCoveragePercent: units ? Math.round((costedUnits / units) * 100) : 0,
    };
  };
  const current = summarizeSales(currentSales);
  const previous = summarizeSales(previousSales);
  const changePercent = (value: number | null, baseline: number | null) => value === null || baseline === null || baseline === 0 ? null : Math.round(((value - baseline) / baseline) * 100);

  const productSales = new Map<string, { name: string; sku: string; units: number; total: number }>();
  for (const sale of currentSales) {
    for (const item of sale.saleItems) {
      const existing = productSales.get(item.product.sku) ?? { name: item.product.name, sku: item.product.sku, units: 0, total: 0 };
      existing.units += item.quantity;
      existing.total += item.total;
      productSales.set(item.product.sku, existing);
    }
  }
  const topProducts = [...productSales.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  const soldUnitsBySku = new Map([...productSales.values()].map((item) => [item.sku, item.units]));
  const stockAttentionAll = inventory.map((item) => {
    const available = Math.max(0, item.stockOnHand - item.reservedStock);
    const reorderPoint = Math.max(item.reorderLevel, item.product.reorderLevel);
    const unitsSold = soldUnitsBySku.get(item.product.sku) ?? 0;
    return {
      name: item.product.name,
      sku: item.product.sku,
      available,
      reorderPoint,
      unitsSold30d: unitsSold,
      daysOfCover: unitsSold > 0 ? Math.round((available / (unitsSold / 30)) * 10) / 10 : null,
    };
  }).sort((a, b) => {
    const aBelow = a.available <= a.reorderPoint;
    const bBelow = b.available <= b.reorderPoint;
    if (aBelow !== bBelow) return aBelow ? -1 : 1;
    return a.available - b.available;
  });
  const stockAttention = stockAttentionAll.slice(0, 8);

  const ageBuckets = { notDue: 0, days1to7: 0, days8to30: 0, days31Plus: 0 };
  let overdueBalance = 0;
  for (const plan of plans) {
    for (const installment of plan.installments) {
      const remaining = Math.max(0, installment.amount - installment.paidAmount);
      if (!remaining) continue;
      if (installment.dueDate >= now) ageBuckets.notDue += remaining;
      else {
        overdueBalance += remaining;
        const daysLate = Math.floor((now.getTime() - installment.dueDate.getTime()) / DAY_MS);
        if (daysLate <= 7) ageBuckets.days1to7 += remaining;
        else if (daysLate <= 30) ageBuckets.days8to30 += remaining;
        else ageBuckets.days31Plus += remaining;
      }
    }
  }

  const dailySales = Array.from({ length: 30 }, (_, index) => {
    const start = new Date(currentStart.getTime() + index * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);
    return {
      label: start.toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }),
      total: roundKes(currentSales.filter((sale) => sale.createdAt >= start && sale.createdAt < end).reduce((sum, sale) => sum + sale.total, 0)),
    };
  });

  return {
    period: { from: currentStart.toISOString(), to: now.toISOString(), days: 30 },
    sales: {
      current: { ...current, averageTicket: current.salesCount ? roundKes(current.total / current.salesCount) : 0 },
      previous,
      totalChangePercent: changePercent(current.total, previous.total),
      collectedChangePercent: changePercent(current.collected, previous.collected),
      profitChangePercent: changePercent(current.estimatedGrossProfit, previous.estimatedGrossProfit),
      daily: dailySales,
    },
    inventory: { stockedProducts: inventory.length, attentionCount: stockAttentionAll.filter((item) => item.available <= item.reorderPoint).length, attention: stockAttention, topProducts },
    credit: { activePlans: plans.length, overdueBalance, ageBuckets },
    generatedAt: now.toISOString(),
  };
}
