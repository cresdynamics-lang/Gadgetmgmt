import { Desk, DeskNote } from "@/components/desk";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/require-page";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const movementLabel: Record<string, string> = {
  RECEIPT: "Stock received",
  SALE: "Stock sold",
  ADJUSTMENT: "Stock adjusted",
  RESERVATION: "Stock reserved",
  RESERVATION_RELEASE: "Reservation released",
};

export default async function ActivityPage() {
  await requirePage("/activity");
  const [sales, movements, alerts, signIns, saleEvents] = await Promise.all([
    prisma.sale.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { cashier: { select: { name: true } } } }),
    prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { product: { select: { name: true } }, user: { select: { name: true } } } }),
    prisma.staffAlert.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, createdAt: true, sender: { select: { name: true } } } }),
    prisma.authEvent.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { name: true } } } }),
    prisma.saleEvent.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { user: { select: { name: true } }, sale: { select: { invoiceNumber: true } } } }),
  ]);
  const loggedSales = new Set(saleEvents.map((event) => event.saleId));
  const events = [
    ...signIns.map(event => ({ id: `auth-${event.id}`, at: event.createdAt, title: event.action, detail: `${event.user.name} · ${event.deviceLabel}` })),
    ...saleEvents.map((event) => ({ id: `sale-event-${event.id}`, at: event.createdAt, title: `${event.kind} · ${event.sale.invoiceNumber}`, detail: `${event.note}${event.amount !== null ? ` · ${money(event.amount)}` : ""}${event.user ? ` · ${event.user.name}` : ""}` })),
    ...sales.filter((sale) => !loggedSales.has(sale.id)).map((sale) => ({ id: `sale-${sale.id}`, at: sale.createdAt, title: `Sale ${sale.invoiceNumber}`, detail: `${money(sale.total)} · ${sale.cashier.name}` })),
    ...movements.map((movement) => ({ id: `move-${movement.id}`, at: movement.createdAt, title: movementLabel[movement.type] ?? "Stock change", detail: `${movement.product.name} · ${movement.quantity} · ${movement.user.name}` })),
    ...alerts.map((alert) => ({ id: `alert-${alert.id}`, at: alert.createdAt, title: alert.title, detail: alert.sender?.name ?? "System" })),
  ].sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, 60);

  return (
    <Desk title="Activity" detail="Every sale step (invoice, payment, receipt, owner tick, trade-in), stock changes, sign-ins and staff alerts. Only the owner can open this log. Entries are not edited here.">
      {events.length ? (
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
          {events.map((event) => (
            <div key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 sm:px-5">
              <div className="min-w-0"><p className="text-sm font-semibold text-[var(--foreground)]">{event.title}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{event.detail}</p></div>
              <time className="text-[11px] text-[var(--muted)]" dateTime={event.at.toISOString()}>{event.at.toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</time>
            </div>
          ))}
        </div>
      ) : <DeskNote>No sales, stock changes, or alerts yet.</DeskNote>}
    </Desk>
  );
}
