import Link from "next/link";

import { Desk, DeskNote } from "@/components/desk";
import { getBusinessInsights } from "@/lib/business-insights";
import { presentBusinessInsights } from "@/lib/finance-visibility";
import { requirePage } from "@/lib/require-page";

export const instant = false;

const money = (amount: number | null) => amount === null ? "—" : `KES ${amount.toLocaleString("en-KE")}`;

export default async function FinancePage() {
  await requirePage("/finance");
  const data = presentBusinessInsights(await getBusinessInsights({}), "OWNER");

  return (
    <Desk title="Finance" detail="Shop sales, collected money, and estimated gross profit. Only the owner can open this desk.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Sales value", money(data.sales.current.total), `${data.sales.current.salesCount} sales in the last 30 days`],
          ["Collected", money(data.sales.current.collected), "Recorded as paid"],
          ["Estimated gross profit", money(data.sales.current.estimatedGrossProfit), data.sales.current.costCoveragePercent === null ? "No cost recorded" : `Cost recorded for ${data.sales.current.costCoveragePercent}% of units`],
          ["Overdue Lipa", money(data.credit.overdueBalance), `${data.credit.activePlans} active plans`],
        ].map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-[#e6e6e2] bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b66]">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-.03em] text-[#111111]">{value}</p>
            <p className="mt-1 text-xs text-[#6b6b66]">{detail}</p>
          </article>
        ))}
      </div>
      <DeskNote>Expenses and payroll are not in these figures. <Link href="/insights" className="font-semibold text-[#0a7d56]">Open business insights</Link> for the longer read.</DeskNote>
    </Desk>
  );
}
