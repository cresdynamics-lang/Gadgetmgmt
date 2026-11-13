import Link from "next/link";
import { DeskNote } from "@/components/desk";
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

  return <div className="workflow-desk security-stack"><div><h2>Device passports</h2><p className="security-detail">Each physical device keeps its identity and history. Product barcodes identify a variant; IMEI and serial identify the individual device.</p></div>{units.length?<section className="workflow-fields">{units.map(unit=><Link key={unit.id} href={`/devices/${unit.id}`} className="security-panel"><h3>{unit.product.name}</h3><p>{unit.imei||unit.serialNumber||"Identifier not recorded"}</p><p className="security-detail">{statusLabel[unit.status]??unit.status.replaceAll("_"," ")} · {unit.branch.name}</p><span className="security-link">Open history</span></Link>)}</section>:<DeskNote>No physical devices are recorded. Receive and identify stock in Inventory first.</DeskNote>}</div>;
}
