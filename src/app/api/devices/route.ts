import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { parseDeviceScan } from "@/lib/device-scan";
import { prisma } from "@/lib/prisma";

const unitInclude = {
  product: { select: { name: true, sku: true, condition: true, configuration: true, productGroup: true } },
  receivedBy: { select: { name: true } },
  soldBy: { select: { name: true } },
  tradeIn: { select: { grade: true, ownershipProof: true, receiptReference: true, hasBox: true, hasCharger: true, value: true, sellerName: true, sellerPhone: true, assessedBy: { select: { name: true } } } },
  sale: { select: { id: true, invoiceNumber: true, createdAt: true, status: true, paymentMethod: true, customer: { select: { name: true, phone: true } } } },
  saleItem: { select: { quantity: true, total: true } },
} satisfies Prisma.DeviceUnitInclude;

type UnitRow = Prisma.DeviceUnitGetPayload<{ include: typeof unitInclude }>;

/** The life story of a phone by IMEI or serial: where it came from, and who bought it, when and for how much. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "inventory.view")) return denied(session.user, "inventory.view", "Your permissions cannot view phone history.");
  if (!session.user.branchId && !canSeeAllBranches(session.user)) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const branchScope = canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" };
  const show = {
    cost: hasPermission(session.user, "finance.view"),
    price: hasPermission(session.user, "reports.view") || hasPermission(session.user, "finance.view"),
    people: hasPermission(session.user, "customers.view"),
    credit: hasPermission(session.user, "credit.view"),
  };

  const raw = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 800);
  const parsed = parseDeviceScan(raw);
  const term = (parsed.imei || parsed.serial || raw).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (raw && term.length < 4) return NextResponse.json({ error: "Enter at least 4 characters of the IMEI or serial." }, { status: 400 });

  const units = await prisma.deviceUnit.findMany({
    where: { ...branchScope, ...(term ? { OR: [{ imei: { contains: term } }, { serial: { contains: term } }] } : {}) },
    include: unitInclude,
    orderBy: { receivedAt: "desc" },
    take: term ? 60 : 30,
  });

  // Phones sold before per-phone records existed are found through their stock item instead.
  const legacyProducts = term ? await prisma.product.findMany({
    where: { ...branchScope, imei: { contains: term }, deviceUnits: { none: {} } },
    select: {
      id: true, imei: true, name: true, sku: true, condition: true, configuration: true, productGroup: true, colour: true, costPrice: true, createdAt: true,
      inventory: { select: { stockOnHand: true, reservedStock: true } },
      movements: { where: { type: "RECEIPT" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true, vendorName: true, sourceKind: true, sourceName: true, sourcePhone: true, reference: true, user: { select: { name: true } } } },
      saleItems: { orderBy: { createdAt: "desc" }, take: 1, select: { quantity: true, total: true, sale: { select: { id: true, invoiceNumber: true, createdAt: true, status: true, paymentMethod: true, cashier: { select: { name: true } }, customer: { select: { name: true, phone: true } } } } } },
      tradeInRecord: { select: { grade: true, ownershipProof: true, receiptReference: true, hasBox: true, hasCharger: true, value: true, sellerName: true, sellerPhone: true, assessedBy: { select: { name: true } } } },
    },
    take: 20,
  }) : [];

  const identities = [...new Set([...units.map((unit) => unit.imei || unit.serial || ""), ...legacyProducts.map((product) => product.imei || "")].filter(Boolean))];
  const plans = show.credit && identities.length
    ? await prisma.creditPlan.findMany({ where: { imei: { in: identities } }, select: { imei: true, planReference: true, status: true, balance: true, totalAmount: true } })
    : [];

  const person = (name: string | null, phone: string | null) => show.people ? { name, phone } : { name, phone: null };
  const tradeInView = (tradeIn: UnitRow["tradeIn"]) => tradeIn ? {
    grade: tradeIn.grade,
    ownershipProof: tradeIn.ownershipProof,
    receiptReference: tradeIn.receiptReference,
    hasBox: tradeIn.hasBox,
    hasCharger: tradeIn.hasCharger,
    value: show.cost ? tradeIn.value : null,
    seller: person(tradeIn.sellerName, tradeIn.sellerPhone),
    assessedBy: tradeIn.assessedBy.name,
  } : null;

  const lives = [
    ...units.map((unit) => ({
      id: unit.id,
      tracked: true,
      imei: unit.imei,
      serial: unit.serial,
      status: unit.status,
      product: unit.product,
      details: { colour: unit.colour, storage: unit.storage, mpn: unit.mpn, modelNumber: unit.modelNumber, batteryHealth: unit.batteryHealth, fmi: unit.fmi, sim: unit.sim, osVersion: unit.osVersion },
      received: {
        at: unit.receivedAt,
        by: unit.receivedBy.name,
        sourceKind: unit.sourceKind,
        vendorName: unit.vendorName,
        source: unit.sourceName || unit.sourcePhone ? person(unit.sourceName, unit.sourcePhone) : null,
        reference: unit.reference,
        cost: show.cost ? unit.costPrice : null,
      },
      tradeIn: tradeInView(unit.tradeIn),
      sale: unit.sale ? {
        id: unit.sale.id,
        invoiceNumber: unit.sale.invoiceNumber,
        at: unit.soldAt ?? unit.sale.createdAt,
        by: unit.soldBy?.name ?? null,
        status: unit.sale.status,
        paymentMethod: unit.sale.paymentMethod,
        customer: unit.sale.customer ? person(unit.sale.customer.name, unit.sale.customer.phone) : null,
        price: show.price && unit.saleItem ? Math.round(unit.saleItem.total / Math.max(1, unit.saleItem.quantity)) : null,
      } : null,
    })),
    ...legacyProducts.map((product) => {
      const receipt = product.movements[0];
      const sold = product.saleItems[0];
      const onHand = product.inventory.reduce((sum, row) => sum + row.stockOnHand, 0);
      return {
        id: product.id,
        tracked: false,
        imei: product.imei,
        serial: null,
        status: onHand > 0 ? "IN_STOCK" as const : sold ? "SOLD" as const : "UNKNOWN" as const,
        product: { name: product.name, sku: product.sku, condition: product.condition, configuration: product.configuration, productGroup: product.productGroup },
        details: { colour: product.colour, storage: null, mpn: null, modelNumber: null, batteryHealth: null, fmi: null, sim: null, osVersion: null },
        received: {
          at: receipt?.createdAt ?? product.createdAt,
          by: receipt?.user.name ?? null,
          sourceKind: receipt?.sourceKind ?? null,
          vendorName: receipt?.vendorName ?? null,
          source: receipt?.sourceName || receipt?.sourcePhone ? person(receipt.sourceName, receipt.sourcePhone) : null,
          reference: receipt?.reference ?? null,
          cost: show.cost ? product.costPrice : null,
        },
        tradeIn: tradeInView(product.tradeInRecord),
        sale: sold && onHand === 0 ? {
          id: sold.sale.id,
          invoiceNumber: sold.sale.invoiceNumber,
          at: sold.sale.createdAt,
          by: sold.sale.cashier.name,
          status: sold.sale.status,
          paymentMethod: sold.sale.paymentMethod,
          customer: sold.sale.customer ? person(sold.sale.customer.name, sold.sale.customer.phone) : null,
          price: show.price ? Math.round(sold.total / Math.max(1, sold.quantity)) : null,
        } : null,
      };
    }),
  ].map((life) => ({ ...life, credit: plans.find((plan) => plan.imei && (plan.imei === life.imei || plan.imei === life.serial)) ?? null }));

  return NextResponse.json({ query: term, lives, show }, { headers: { "Cache-Control": "no-store" } });
}
