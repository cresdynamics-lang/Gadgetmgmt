import type { Prisma, TenderMethod } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Full payment can arrive as cash, bank transfer, card or M-Pesa send money. */
export const FULL_PAYMENT_METHODS = ["CASH", "BANK", "CARD", "MPESA"] as const;
export type FullPaymentMethod = typeof FULL_PAYMENT_METHODS[number];

/** Lipa Mdogo Mdogo never starts below this deposit, whatever a branch policy says. */
export const LIPA_MINIMUM_DEPOSIT_PERCENT = 40;

export const tenderLabels: Record<TenderMethod, string> = {
  CASH: "Cash",
  BANK: "Bank transfer",
  CARD: "Card",
  MPESA: "M-Pesa",
  TRADE_IN: "Trade-in credit",
};

/** M-Pesa and bank entries (and trade-in credit) wait for the owner's tick. */
export function requiresOwnerTick(method: TenderMethod) {
  return method === "MPESA" || method === "BANK" || method === "TRADE_IN";
}

/** M-Pesa needs its confirmation code; a bank transfer needs its bank reference. */
export function referenceProblem(method: TenderMethod, reference: string | null | undefined) {
  const value = reference?.trim() ?? "";
  if (method === "MPESA") return /^[A-Z0-9]{6,32}$/i.test(value) ? null : "Enter the M-Pesa confirmation code.";
  if (method === "BANK") return /^[A-Z0-9][A-Z0-9 /._-]{3,39}$/i.test(value) ? null : "Enter the bank transfer reference.";
  if (method === "TRADE_IN") return null;
  return value ? "A reference is only recorded for M-Pesa or bank transfer." : null;
}

export function effectiveDepositPercent(policyPercent: number | null | undefined) {
  return Math.max(LIPA_MINIMUM_DEPOSIT_PERCENT, policyPercent ?? LIPA_MINIMUM_DEPOSIT_PERCENT);
}

export async function recordSaleEvents(
  tx: Tx,
  sale: { id: string; branchId: string },
  userId: string | null,
  events: { kind: string; note: string; amount?: number | null }[],
) {
  if (!events.length) return;
  await tx.saleEvent.createMany({
    data: events.map((event) => ({ saleId: sale.id, branchId: sale.branchId, userId, kind: event.kind, note: event.note.slice(0, 500), amount: event.amount ?? null })),
  });
}

export function saleReceiptEmail(sale: {
  invoiceNumber: string;
  createdAt: Date;
  total: number;
  paidAmount: number;
  branch: { name: string; phone: string };
  cashier: { name: string };
  saleItems: { quantity: number; total: number; product: { name: string; sku: string } }[];
  payments?: { amount: number; method: TenderMethod; reference?: string | null }[];
}) {
  const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
  return {
    subject: `GadgetHub receipt ${sale.invoiceNumber}`,
    body: [
      `Thank you for shopping with GadgetHub. Your receipt is attached as a PDF.`,
      ``,
      `Receipt ${sale.invoiceNumber}`,
      `${sale.branch.name} · ${sale.createdAt.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}`,
      ...sale.saleItems.map((item) => `${item.product.name} (${item.product.sku}) × ${item.quantity}: ${money(item.total)}`),
      `Total: ${money(sale.total)}`,
      ...(sale.payments ?? []).map((payment) => `${tenderLabels[payment.method]}${payment.reference ? ` ${payment.reference}` : ""}: ${money(payment.amount)}`),
      `Paid: ${money(sale.paidAmount)}`,
      ...(sale.total > sale.paidAmount ? [`Balance due: ${money(sale.total - sale.paidAmount)}`] : []),
      `Served by ${sale.cashier.name}`,
      `Shop contact: ${sale.branch.phone}`,
    ].join("\n"),
  };
}

/** Receipt notifications carry the sale id in their dedupe key: receipt:<saleId>:<key>. */
export function saleIdFromReceiptKey(dedupeKey: string) {
  const match = /^receipt:([a-z0-9]{20,40}):/i.exec(dedupeKey);
  return match?.[1] ?? null;
}
