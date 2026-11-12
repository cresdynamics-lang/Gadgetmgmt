import { Desk, DeskNote } from "@/components/desk";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/require-page";

export const instant = false;

export default async function RepairsPage() {
  const session = await requirePage("/repairs");
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const units = await prisma.stockUnit.findMany({
    where: { ...scope, status: "IN_REPAIR" },
    include: { product: { select: { name: true, sku: true } }, branch: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  return (
    <Desk title="Repairs" detail="Devices marked in repair. A repairer name and a due date are not stored on the device yet.">
      {units.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e6e6e2] bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[#f4f4f2] text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b66]">
              <tr><th className="px-4 py-3">Device</th><th className="px-4 py-3">Identifier</th><th className="px-4 py-3">Branch</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e6e6e2]">
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td className="px-4 py-3"><span className="block font-semibold text-[#111111]">{unit.product.name}</span><span className="text-[11px] text-[#6b6b66]">{unit.product.sku}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-[#111111]">{unit.imei || unit.serialNumber || "No code recorded"}</td>
                  <td className="px-4 py-3 text-[#6b6b66]">{unit.branch.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <DeskNote>No devices are marked in repair.</DeskNote>}
    </Desk>
  );
}
