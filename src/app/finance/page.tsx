import { ownedStockValuation } from "@/lib/stock-valuation";
import { prisma } from "@/lib/prisma";
import { isCapitalCost } from "@/lib/expenses";
import Link from "next/link";

import { Desk, DeskNote } from "@/components/desk";
import { getBusinessInsights } from "@/lib/business-insights";
import { presentBusinessInsights } from "@/lib/finance-visibility";
import { requirePage } from "@/lib/require-page";

export const instant = false;

const money = (amount: number | null) => amount === null ? "—" : `KES ${amount.toLocaleString("en-KE")}`;

function reportingWindow() {const now=Date.now();return {previousStart:new Date(now-60*86400000),currentStart:new Date(now-30*86400000)};}

export default async function FinancePage() {
  await requirePage("/finance");
  const data = presentBusinessInsights(await getBusinessInsights({}), "OWNER");

  const valuation=await ownedStockValuation({});
  const {previousStart,currentStart}=reportingWindow();
  const entries=await prisma.expenseEntry.findMany({where:{occurredAt:{gte:previousStart}},select:{amount:true,category:true,unitId:true,occurredAt:true}});
  const currentEntries=entries.filter(entry=>entry.occurredAt>=currentStart);
  const operating=currentEntries.filter(entry=>!isCapitalCost(entry)).reduce((sum,entry)=>sum+entry.amount,0);
  const previousOperating=entries.filter(entry=>entry.occurredAt<currentStart&&!isCapitalCost(entry)).reduce((sum,entry)=>sum+entry.amount,0);
  const [saleReceipts,creditReceipts]=await Promise.all([prisma.salePayment.aggregate({where:{createdAt:{gte:currentStart},sale:{status:{not:"VOIDED"}}},_sum:{amount:true}}),prisma.payment.aggregate({where:{createdAt:{gte:currentStart}},_sum:{amount:true}})]);
  const cashReceived=(saleReceipts._sum.amount??0)+(creditReceipts._sum.amount??0);
  const cashOut=currentEntries.reduce((sum,entry)=>sum+entry.amount,0);
  const net=data.sales.current.estimatedGrossProfit===null?null:data.sales.current.estimatedGrossProfit-operating;
  const attributed=await prisma.sale.groupBy({by:["customerId"],where:{status:{in:["PAID","PARTIAL"]},createdAt:{gte:currentStart}},_sum:{total:true},_count:true});
  const customers=await prisma.customer.findMany({where:{id:{in:attributed.flatMap(row=>row.customerId?[row.customerId]:[])}},select:{id:true,marketingSource:true}});
  const sources=new Map<string,{count:number;total:number}>();
  for(const row of attributed){const source=customers.find(customer=>customer.id===row.customerId)?.marketingSource||"Unattributed";const bucket=sources.get(source)||{count:0,total:0};bucket.count+=row._count;bucket.total+=row._sum.total??0;sources.set(source,bucket);}
  return (
    <Desk title="Finance" detail="Shop sales, collected money, and estimated gross profit. Only the owner can open this desk.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Sales value", money(data.sales.current.total), `${data.sales.current.salesCount} sales in the last 30 days`],
          ["Recorded receipts", money(cashReceived), "Actual payment entries dated in the last 30 days"],
          ["Estimated gross profit", money(data.sales.current.estimatedGrossProfit), data.sales.current.costCoveragePercent === null ? "No cost recorded" : `Cost recorded for ${data.sales.current.costCoveragePercent}% of units`],
          ["Estimated owned stock basis", money(valuation.totalValue), `${valuation.awayCount} owned devices with repairers or partners; borrowed stock excluded`],
          ["Operating expenses", money(operating), `Previous 30 days: ${money(previousOperating)}`],
          ["Estimated net operating result", money(net), "Gross estimate minus recorded operating expenses"],
          ["Recorded expense cash out", money(cashOut), "Includes inventory purchases; not deducted twice from gross profit"],
          ["Overdue Lipa", money(data.credit.overdueBalance), `${data.credit.activePlans} active plans`],
        ].map(([label, value, detail]) => (
          <article key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{label}</p>
            <p className="mt-2 text-xl font-semibold tracking-[-.03em] text-[var(--foreground)]">{value}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
          </article>
        ))}
      </div>
      <section className="security-panel"><h3>Customer-stated marketing attribution</h3><p className="security-detail">Last 30 days. Source is what the customer stated, not inferred advertising causation. Marketing expenses are recorded separately.</p>{[...sources].map(([source,row])=><div className="workflow-row" key={source}><span>{source} · {row.count} sales</span><strong>{money(row.total)}</strong></div>)}</section>
      <DeskNote>Stock basis uses approved per-device entries where available and catalog cost for unidentified stock. Reconcile any count disagreements before relying on it. Estimated net result uses recorded sale-cost coverage and operating expenses. Inventory purchases and unit-linked capital costs are excluded from operating expenses to avoid double deduction. Payroll uses approved actual payments; no statutory calculation is invented. <Link href="/expenses" className="security-link">Review expenses and corrections</Link> <Link href="/insights" className="font-semibold text-[var(--accent-text)]">Open business insights</Link> for the longer read.</DeskNote>
    </Desk>
  );
}
