import { AppShell } from "@/components/app-shell";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default async function ReportsPage() {
  const session = await auth();
  const scope = session?.user.role === "OWNER" ? {} : { branchId: session?.user.branchId ?? "" };
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startPeriod = new Date(startToday);
  startPeriod.setDate(startPeriod.getDate() - 29);

  const sales = await prisma.sale.findMany({
    where: { ...scope, status: { not: "VOIDED" }, createdAt: { gte: startPeriod } },
    include: { branch: { select: { name: true } }, saleItems: { include: { product: { select: { name: true, category: true, sku: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const unitsSold = sales.reduce((sum, sale) => sum + sale.saleItems.reduce((unitSum, item) => unitSum + item.quantity, 0), 0);
  const todayRevenue = sales.filter((sale) => sale.createdAt >= startToday).reduce((sum, sale) => sum + sale.total, 0);
  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(startToday);
    date.setDate(date.getDate() - (13 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return { label: date.toLocaleDateString("en-KE", { day: "numeric", month: "short" }), value: sales.filter((sale) => sale.createdAt >= date && sale.createdAt < next).reduce((sum, sale) => sum + sale.total, 0) };
  });
  const maxDaily = Math.max(1, ...daily.map((day) => day.value));
  const methods = new Map<string, { count: number; value: number }>();
  const products = new Map<string, { sku: string; name: string; category: string; units: number; value: number }>();
  for (const sale of sales) {
    const method = methods.get(sale.paymentMethod) ?? { count: 0, value: 0 };
    method.count += 1;
    method.value += sale.paidAmount;
    methods.set(sale.paymentMethod, method);
    for (const line of sale.saleItems) {
      const product = products.get(line.productId) ?? { sku: line.product.sku, name: line.product.name, category: line.product.category, units: 0, value: 0 };
      product.units += line.quantity;
      product.value += line.total;
      products.set(line.productId, product);
    }
  }
  const topProducts = [...products.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  const methodRows = [...methods.entries()].sort((a, b) => b[1].value - a[1].value);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Business intelligence</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Sales reports</h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#69746c]">Reporting period</p>
            <p className="mt-1 text-sm font-medium">Last 30 days · through {today.toLocaleDateString("en-KE")}</p>
          </div>
        </div>

        <div className="grid border-y border-[#dfe4df] bg-white sm:grid-cols-2 xl:grid-cols-4">
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-r xl:border-b-0">
            <p className="text-xs text-[#69746c]">Net recorded sales</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{money(revenue)}</p>
          </div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 xl:border-b-0 xl:border-r">
            <p className="text-xs text-[#69746c]">Transactions</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{sales.length.toLocaleString("en-KE")}</p>
          </div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-r sm:border-b-0">
            <p className="text-xs text-[#69746c]">Units sold</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{unitsSold.toLocaleString("en-KE")}</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-xs text-[#69746c]">Revenue today</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{money(todayRevenue)}</p>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
          <section className="border border-[#dfe4df] bg-white">
            <div className="border-b border-[#e8ebe8] px-4 py-3.5">
              <h3 className="text-sm font-semibold">Daily revenue</h3>
              <p className="mt-1 text-xs text-[#69746c]">Last 14 days</p>
            </div>
            <div className="grid h-56 grid-cols-7 gap-3 px-4 py-4 sm:grid-cols-14 sm:gap-2">
              {daily.map((day) => (
                <div key={day.label} className="flex min-w-0 flex-col items-center justify-end gap-2">
                  <div className="flex h-40 w-full items-end">
                    <div title={`${day.label}: ${money(day.value)}`} className="w-full bg-[#315d3f]" style={{ height: `${Math.max(3, (day.value / maxDaily) * 100)}%` }} />
                  </div>
                  <span className="hidden truncate text-[9px] text-[#69746c] sm:block">{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[#dfe4df] bg-white">
            <div className="border-b border-[#e8ebe8] px-4 py-3.5">
              <h3 className="text-sm font-semibold">Payment methods</h3>
              <p className="mt-1 text-xs text-[#69746c]">Recorded tender by channel</p>
            </div>
            <div className="divide-y divide-[#edf0ed]">
              {methodRows.map(([method, summary]) => (
                <div key={method} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{method}</p>
                    <p className="mt-1 text-xs text-[#69746c]">{summary.count} transactions</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{money(summary.value)}</span>
                </div>
              ))}
              {!methodRows.length ? (
                <p className="px-4 py-8 text-sm text-[#69746c]">No payment activity recorded for this period.</p>
              ) : null}
            </div>
          </section>
        </div>

        <section className="border border-[#dfe4df] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5">
            <h3 className="text-sm font-semibold">Product performance</h3>
            <span className="text-xs text-[#69746c]">Top items by sales value</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Units sold</th>
                  <th className="px-4 py-3 text-right font-medium">Sales value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ed]">
                {topProducts.map((product) => (
                  <tr key={product.sku}>
                    <td className="px-4 py-3 font-medium">{product.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#69746c]">{product.sku}</td>
                    <td className="px-4 py-3 text-[#69746c]">{product.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{product.units}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(product.value)}</td>
                  </tr>
                ))}
                {!topProducts.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-9 text-center">
                      <p className="text-sm font-semibold">No sales recorded in this period</p>
                      <p className="mt-1 text-sm text-[#69746c]">Product performance will appear after completed sales.</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
