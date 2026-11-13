import type { getBusinessInsights } from "@/lib/business-insights";

export type BusinessInsights = Awaited<ReturnType<typeof getBusinessInsights>>;

export type PresentedInsights = {
  period: BusinessInsights["period"];
  financeVisible: boolean;
  sales: {
    current: {
      salesCount: number;
      units: number;
      total: number | null;
      collected: number | null;
      estimatedGrossProfit: number | null;
      averageTicket: number | null;
      costCoveragePercent: number | null;
    };
    previous: {
      salesCount: number;
      units: number;
      total: number | null;
      collected: number | null;
      estimatedGrossProfit: number | null;
    };
    totalChangePercent: number | null;
    collectedChangePercent: number | null;
    profitChangePercent: number | null;
    daily: { label: string; total: number | null }[];
  };
  inventory: {
    stockedProducts: number;
    attentionCount: number;
    attention: BusinessInsights["inventory"]["attention"];
    topProducts: { name: string; sku: string; units: number; total: number | null }[];
  };
  credit: {
    activePlans: number;
    overdueBalance: number | null;
    ageBuckets: BusinessInsights["credit"]["ageBuckets"] | null;
  };
  generatedAt: string;
};

/** Buying price, profit, margin, revenue totals, Lipa totals and stock value stay with the owner. */
export function canViewFinance(role: string | null | undefined) {
  return role === "OWNER";
}

export function presentBusinessInsights(insights: BusinessInsights, role: string | null | undefined): PresentedInsights {
  if (canViewFinance(role)) {
    return {
      ...insights,
      financeVisible: true,
      sales: {
        ...insights.sales,
        current: { ...insights.sales.current },
        previous: {
          salesCount: insights.sales.previous.salesCount,
          units: insights.sales.previous.units,
          total: insights.sales.previous.total,
          collected: insights.sales.previous.collected,
          estimatedGrossProfit: insights.sales.previous.estimatedGrossProfit,
        },
      },
    };
  }

  return {
    period: insights.period,
    financeVisible: false,
    generatedAt: insights.generatedAt,
    sales: {
      current: {
        salesCount: insights.sales.current.salesCount,
        units: insights.sales.current.units,
        total: null,
        collected: null,
        estimatedGrossProfit: null,
        averageTicket: null,
        costCoveragePercent: null,
      },
      previous: {
        salesCount: insights.sales.previous.salesCount,
        units: insights.sales.previous.units,
        total: null,
        collected: null,
        estimatedGrossProfit: null,
      },
      totalChangePercent: null,
      collectedChangePercent: null,
      profitChangePercent: null,
      daily: insights.sales.daily.map((day) => ({ label: day.label, total: null })),
    },
    inventory: {
      stockedProducts: insights.inventory.stockedProducts,
      attentionCount: insights.inventory.attentionCount,
      attention: insights.inventory.attention,
      topProducts: insights.inventory.topProducts.map(({ name, sku, units }) => ({ name, sku, units, total: null })),
    },
    credit: {
      activePlans: insights.credit.activePlans,
      overdueBalance: null,
      ageBuckets: null,
    },
  };
}

export function omitSaleCost<T extends { saleItems?: readonly { unitCost?: number; totalCost?: number | null }[] }>(sale: T, role: string | null | undefined): T {
  if (canViewFinance(role) || !sale.saleItems) return sale;
  return {
    ...sale,
    saleItems: sale.saleItems.map((item) => {
      const rest = { ...item };
      delete rest.unitCost;
      delete rest.totalCost;
      return rest;
    }),
  };
}
