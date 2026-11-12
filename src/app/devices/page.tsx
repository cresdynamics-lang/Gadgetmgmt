import { Desk, DeskNote } from "@/components/desk";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/require-page";

export const instant = false;

const statusLabel: Record<string, string> = {
  IN_STOCK: "In stock",
  RESERVED: "Reserved",
  SOLD: "Sold",
  IN_REPAIR: "In repair",
  RETURNED: "Returned",
};

export default async function DevicesPage() {
  const session = await requirePage("/devices");
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const units = await prisma.stockUnit.findMany({
    where: scope,
    include: { product: { select: { name: true, sku: true } }, branch: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  return (
    <Desk title="Devices" detail="Each phone or serialised item, newest change first. Search still starts from Sales.">
      {units.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e6e6e2] bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#f4f4f2] text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b66]">
              <tr>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Identifier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Branch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e6e2]">
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td className="px-4 py-3"><span className="block font-semibold text-[#111111]">{unit.product.name}</span><span className="text-[11px] text-[#6b6b66]">{unit.product.sku}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-[#111111]">{unit.imei || unit.imei2 || unit.serialNumber || unit.barcode || "No code recorded"}</td>
                  <td className="px-4 py-3 text-[#111111]">{statusLabel[unit.status] ?? unit.status}</td>
                  <td className="px-4 py-3 text-[#6b6b66]">{unit.branch.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <DeskNote>No devices are recorded for this branch.</DeskNote>}
    </Desk>
  );
}
