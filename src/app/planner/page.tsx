import { Desk, DeskNote } from "@/components/desk";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/require-page";
import { needsReorder, reorderThreshold, stockAttentionRank } from "@/lib/stock-levels";

export const instant = false;

export default async function PlannerPage() {
  const session = await requirePage("/planner");
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const items = await prisma.inventoryItem.findMany({
    where: scope,
    include: { product: { select: { name: true, sku: true, reorderLevel: true } }, branch: { select: { name: true } } },
  });
  const rows = items
    .map((item) => {
      const available = item.stockOnHand - item.reservedStock;
      const threshold = reorderThreshold(item.reorderLevel, item.product.reorderLevel);
      return { id: item.id, name: item.product.name, sku: item.product.sku, branch: item.branch.name, available, reserved: item.reservedStock, threshold, attention: needsReorder(available, item.reorderLevel, item.product.reorderLevel) };
    })
    .sort((left, right) => stockAttentionRank(left.available, left.threshold, 0) - stockAttentionRank(right.available, right.threshold, 0) || left.name.localeCompare(right.name));

  return (
    <Desk title="Stock planner" detail="What is on hand against the reorder point already set on the product. No extra order quantity is calculated.">
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e6e6e2] bg-white">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#f4f4f2] text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b66]">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Available</th><th className="px-4 py-3">Reserved</th><th className="px-4 py-3">Reorder at</th><th className="px-4 py-3">Branch</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e6e6e2]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3"><span className="block font-semibold text-[#111111]">{row.name}</span><span className="text-[11px] text-[#6b6b66]">{row.sku}</span></td>
                  <td className={`px-4 py-3 font-semibold tabular-nums ${row.attention ? "text-[#8a5a12]" : "text-[#111111]"}`}>{row.available}{row.attention ? " · reorder" : ""}</td>
                  <td className="px-4 py-3 tabular-nums text-[#6b6b66]">{row.reserved}</td>
                  <td className="px-4 py-3 tabular-nums text-[#6b6b66]">{row.threshold > 0 ? row.threshold : "Not set"}</td>
                  <td className="px-4 py-3 text-[#6b6b66]">{row.branch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <DeskNote>No stock records to plan from.</DeskNote>}
    </Desk>
  );
}
