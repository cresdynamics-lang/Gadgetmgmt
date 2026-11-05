/**
 * Give every phone already in the system its own GadgetHub barcode.
 * Safe to run again: only phones without a code are touched.
 *   npx tsx scripts/backfill-unit-codes.ts
 */
import { prisma } from "../src/lib/prisma";
import { allocateUnitCode } from "../src/lib/unit-code";

async function main() {
  const units = await prisma.deviceUnit.findMany({ where: { unitCode: null }, select: { id: true } });
  for (const unit of units) {
    await prisma.deviceUnit.update({ where: { id: unit.id }, data: { unitCode: await allocateUnitCode(prisma) } });
  }
  const left = await prisma.deviceUnit.count({ where: { unitCode: null } });
  console.log(`Gave ${units.length} phone${units.length === 1 ? "" : "s"} a barcode. Without one: ${left}.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); }).finally(() => prisma.$disconnect());
