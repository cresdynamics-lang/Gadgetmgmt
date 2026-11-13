import { Desk, DeskNote } from "@/components/desk";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/require-page";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const roleName: Record<string, string> = { OWNER: "Owner", BRANCH_MANAGER: "Branch manager", CASHIER: "Cashier", INVENTORY_LEAD: "Inventory lead" };

export default async function PerformancePage() {
  const session = await requirePage("/performance");
  const role = session.user.role;
  const finance = role === "OWNER";
  const branchScope = role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const personScope = role === "CASHIER" ? { cashierId: session.user.id } : branchScope;
  const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).format(new Date());
  const startMonth = new Date(`${monthKey}-01T00:00:00+03:00`);
  const previousMonth = new Date(startMonth);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const recorded = { in: ["PAID", "PARTIAL"] as ("PAID" | "PARTIAL")[] };

  const [current, previous] = await Promise.all([
    prisma.sale.groupBy({ by: ["cashierId"], where: { ...personScope, createdAt: { gte: startMonth }, status: recorded }, _count: { _all: true }, _sum: { total: true } }),
    prisma.sale.groupBy({ by: ["cashierId"], where: { ...personScope, createdAt: { gte: previousMonth, lt: startMonth }, status: recorded }, _count: { _all: true } }),
  ]);
  const people = await prisma.user.findMany({
    where: { id: { in: [...new Set([...current.map((row) => row.cashierId), ...previous.map((row) => row.cashierId)])] } },
    select: { id: true, name: true, role: true },
  });
  const previousCount = new Map(previous.map((row) => [row.cashierId, row._count._all]));
  const rows = current
    .map((row) => {
      const person = people.find((item) => item.id === row.cashierId);
      const prior = previousCount.get(row.cashierId) ?? 0;
      return { id: row.cashierId, name: person?.name ?? "Former staff", role: person?.role ?? "", sales: row._count._all, total: row._sum.total ?? 0, prior, change: row._count._all - prior };
    })
    .sort((left, right) => right.sales - left.sales || left.name.localeCompare(right.name));

  return (
    <Desk title={role === "CASHIER" ? "Your sales" : "Staff performance"} detail="Completed sales this month, compared with last month by count. Sale value stays with the owner. Targets are not set.">
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[var(--background)] text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Sales</th>
                {finance ? <th className="px-4 py-3">Value</th> : null}
                <th className="px-4 py-3">Last month</th>
                <th className="px-4 py-3">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3"><span className="block font-semibold text-[var(--foreground)]">{row.name}</span><span className="text-[11px] text-[var(--muted)]">{roleName[row.role] ?? "Staff"}</span></td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-[var(--foreground)]">{row.sales}</td>
                  {finance ? <td className="px-4 py-3 tabular-nums text-[var(--foreground)]">{money(row.total)}</td> : null}
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{row.prior}</td>
                  <td className={`px-4 py-3 font-semibold tabular-nums ${row.change < 0 ? "text-[var(--danger-text)]" : "text-[var(--accent-text)]"}`}>{row.change > 0 ? `+${row.change}` : row.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <DeskNote>No completed sales this month.</DeskNote>}
    </Desk>
  );
}
