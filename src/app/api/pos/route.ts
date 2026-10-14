import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { proportionalIntegerShare } from "@/lib/money-allocation";
import { deliverNotification } from "@/lib/notifications";
import { normalizeKenyanPhone } from "@/lib/mpesa";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "sales")) return NextResponse.json({ error: "Your role cannot access sales." }, { status: 403 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const [products, customers, creditPolicy] = await Promise.all([
    prisma.product.findMany({
      where: { branchId },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        sellingPrice: true,
        inventory: {
          where: { branchId },
          select: { stockOnHand: true, reservedStock: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: { branchId, status: "ACTIVE" },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.creditPolicy.findUnique({ where: { branchId }, select: { minimumDepositPercent: true, defaultCreditLimit: true } }),
  ]);

  return NextResponse.json({
    products: products.map(({ inventory, ...product }) => ({
      ...product,
      available: Math.max(0, (inventory[0]?.stockOnHand ?? 0) - (inventory[0]?.reservedStock ?? 0)),
    })),
    customers,
    creditPolicy: creditPolicy ?? { minimumDepositPercent: 20, defaultCreditLimit: 0 },
  });
}

const checkoutSchema = z.object({
  items: z.array(z.object({ productId: z.string().cuid(), quantity: z.number().int().min(1).max(1000) })).min(1).max(100),
  customerId: z.string().cuid().nullable().optional(),
  payerPhone: z.string().trim().min(7).max(30).optional(),
  payerConsent: z.literal(true).optional(),
  newCustomer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30),
    email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  }).strict().optional(),
  paymentMethod: z.enum(["CASH", "MPESA", "CARD", "CREDIT", "SPLIT", "PAY_LINK"]),
  creditTermMonths: z.union([z.literal(4), z.literal(6), z.literal(12)]).optional(),
  creditDepositAmount: z.number().int().positive().max(2_000_000_000).optional(),
  creditDepositMethod: z.enum(["CASH", "MPESA", "CARD"]).optional(),
  creditDepositReference: z.string().trim().toUpperCase().min(6).max(32).optional(),
  imei: z.string().trim().regex(/^\d{14,16}$/).optional(),
  paymentBreakdown: z.array(z.object({ method: z.enum(["CASH", "MPESA", "CARD"]), amount: z.number().int().positive().max(2_000_000_000) })).min(2).max(3).optional(),
  discountAmount: z.number().int().nonnegative().max(2_000_000_000).default(0),
  taxAmount: z.number().int().nonnegative().max(2_000_000_000).default(0),
}).strict().superRefine((data, context) => {
  if (data.customerId && data.newCustomer) {
    context.addIssue({ code: "custom", path: ["customerId"], message: "Choose an existing customer or enter a new customer, not both." });
  }
  if (data.paymentMethod === "SPLIT" && !data.paymentBreakdown) {
    context.addIssue({ code: "custom", path: ["paymentBreakdown"], message: "Split tenders require a payment breakdown." });
  }
  if (data.paymentMethod !== "SPLIT" && data.paymentBreakdown) {
    context.addIssue({ code: "custom", path: ["paymentBreakdown"], message: "Payment breakdown is only valid for split tenders." });
  }
  if (data.paymentMethod === "CREDIT" && !data.customerId && !data.newCustomer) {
    context.addIssue({ code: "custom", path: ["newCustomer"], message: "Add or select a customer for a Lipa plan." });
  }
  if (data.paymentMethod === "PAY_LINK" && (!data.payerPhone || data.payerConsent !== true)) {
    context.addIssue({ code: "custom", path: ["payerPhone"], message: "Enter the payer’s number and confirm they agreed to receive the payment link." });
  }
  if (data.paymentMethod !== "PAY_LINK" && (data.payerPhone || data.payerConsent)) {
    context.addIssue({ code: "custom", path: ["payerPhone"], message: "Payer contact details are only valid for a payer link." });
  }
  if (data.paymentMethod === "CREDIT" && (!data.creditTermMonths || !data.creditDepositAmount || !data.creditDepositMethod)) {
    context.addIssue({ code: "custom", path: ["creditTermMonths"], message: "Choose a loan term, deposit amount and deposit payment method." });
  }
  if (data.paymentMethod === "CREDIT" && data.creditDepositMethod === "MPESA" && !data.creditDepositReference) {
    context.addIssue({ code: "custom", path: ["creditDepositReference"], message: "Enter the verified M-Pesa transaction code for the deposit." });
  }
  if (data.paymentMethod === "CREDIT" && data.creditDepositMethod !== "MPESA" && data.creditDepositReference) {
    context.addIssue({ code: "custom", path: ["creditDepositReference"], message: "An M-Pesa transaction code is only valid for an M-Pesa deposit." });
  }
  if (data.imei && (data.paymentMethod !== "CREDIT" || data.items.length !== 1 || data.items[0].quantity !== 1)) {
    context.addIssue({ code: "custom", path: ["imei"], message: "Enter one IMEI only for a single-unit Lipa sale." });
  }
  if (data.paymentMethod !== "CREDIT" && (data.creditTermMonths || data.creditDepositAmount || data.creditDepositMethod || data.creditDepositReference)) {
    context.addIssue({ code: "custom", path: ["creditTermMonths"], message: "Loan details are only valid for a credit sale." });
  }
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "sales")) return NextResponse.json({ error: "Your role cannot create sales." }, { status: 403 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The checkout details are invalid." }, { status: 400 });
  const payerPhone = parsed.data.paymentMethod === "PAY_LINK" ? normalizeKenyanPhone(parsed.data.payerPhone ?? "") : null;
  if (parsed.data.paymentMethod === "PAY_LINK" && !payerPhone) return NextResponse.json({ error: "Enter a valid Kenyan mobile number for the payer." }, { status: 400 });
  const paymentBaseUrl = (process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  if (parsed.data.paymentMethod === "PAY_LINK") {
    let baseUrl: URL;
    try { baseUrl = new URL(paymentBaseUrl); } catch { return NextResponse.json({ error: "Set APP_BASE_URL to the public address of this app before sending payment links." }, { status: 503 }); }
    if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") return NextResponse.json({ error: "Payment links require a public HTTPS APP_BASE_URL in production." }, { status: 503 });
    if (!process.env.AT_USERNAME || !process.env.AT_API_KEY) return NextResponse.json({ error: "SMS delivery is not configured. Add Africa’s Talking credentials before creating a payer link." }, { status: 503 });
  }
  if (parsed.data.paymentMethod === "CREDIT" && !parsed.data.customerId && !parsed.data.newCustomer) {
    return NextResponse.json({ error: "Add or select a customer to create a Lipa plan." }, { status: 400 });
  }
  if (parsed.data.paymentMethod === "SPLIT" && !parsed.data.paymentBreakdown) {
    return NextResponse.json({ error: "Enter at least two payment methods for a split tender." }, { status: 400 });
  }
  if ((parsed.data.discountAmount > 0 || parsed.data.taxAmount > 0) && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Only an administrator can apply checkout adjustments." }, { status: 403 });
  }

  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  try {
    const sale = await prisma.$transaction(async (transaction) => {
      const productIds = [...quantities.keys()];
      const products = await transaction.product.findMany({
        where: { id: { in: productIds }, branchId },
        select: {
          id: true,
          name: true,
          costPrice: true,
          sellingPrice: true,
          inventory: { where: { branchId }, select: { id: true, stockOnHand: true, reservedStock: true } },
        },
      });

      if (products.length !== productIds.length) throw new Error("PRODUCT_UNAVAILABLE");

      const lineItems = products.map((product) => {
        const quantity = quantities.get(product.id)!;
        const inventory = product.inventory[0];
        if (!inventory || inventory.stockOnHand - inventory.reservedStock < quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        }
        const lineSubtotal = product.sellingPrice * quantity;
        if (!Number.isSafeInteger(lineSubtotal) || lineSubtotal < 1 || lineSubtotal > 2_147_483_647) throw new Error("SALE_AMOUNT_OUT_OF_RANGE");
        return { product, inventory, quantity, subtotal: lineSubtotal };
      });

      let customerId = parsed.data.customerId ?? null;
      if (parsed.data.newCustomer) {
        const createdCustomer = await transaction.customer.create({
          data: {
            name: parsed.data.newCustomer.name,
            phone: parsed.data.newCustomer.phone,
            email: parsed.data.newCustomer.email || null,
            branchId,
          },
          select: { id: true },
        });
        customerId = createdCustomer.id;
      }

      if (customerId) {
        const customer = await transaction.customer.findFirst({
          where: { id: customerId, branchId, status: "ACTIVE" },
          select: { id: true, creditLimit: true },
        });
        if (!customer) throw new Error("CUSTOMER_UNAVAILABLE");
      }

      for (const { inventory, quantity, product } of lineItems) {
        const updated = await transaction.inventoryItem.updateMany({
          where: { id: inventory.id, stockOnHand: { gte: inventory.reservedStock + quantity }, reservedStock: inventory.reservedStock },
          data: parsed.data.paymentMethod === "PAY_LINK"
            ? { reservedStock: { increment: quantity } }
            : { stockOnHand: { decrement: quantity } },
        });
        if (updated.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      }

      const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
      if (!Number.isSafeInteger(subtotal) || subtotal > 2_147_483_647) throw new Error("SALE_AMOUNT_OUT_OF_RANGE");
      if (parsed.data.discountAmount > subtotal) throw new Error("DISCOUNT_EXCEEDS_SUBTOTAL");
      const total = subtotal - parsed.data.discountAmount + parsed.data.taxAmount;
      if (!Number.isSafeInteger(total) || total < 1 || total > 2_147_483_647) throw new Error("SALE_AMOUNT_OUT_OF_RANGE");
      const paidAmount = parsed.data.paymentMethod === "CREDIT" ? parsed.data.creditDepositAmount! : parsed.data.paymentMethod === "PAY_LINK" ? 0 : total;
      if (paidAmount > total) throw new Error("DEPOSIT_EXCEEDS_TOTAL");
      if (parsed.data.paymentMethod === "CREDIT" && customerId) {
        const customer = await transaction.customer.findFirst({ where: { id: customerId, branchId }, select: { creditLimit: true, status: true } });
        if (customer?.status === "CREDIT_HOLD") throw new Error("CUSTOMER_CREDIT_HOLD");
        const [policy, exposure] = await Promise.all([
          transaction.creditPolicy.findUnique({ where: { branchId }, select: { minimumDepositPercent: true, defaultCreditLimit: true } }),
          transaction.creditPlan.aggregate({ where: { branchId, customerId, balance: { gt: 0 } }, _sum: { balance: true } }),
        ]);
        const depositPercent = policy?.minimumDepositPercent ?? 20;
        if (paidAmount * 100 < total * depositPercent) throw new Error("DEPOSIT_BELOW_POLICY");
        const creditLimit = customer?.creditLimit || policy?.defaultCreditLimit || 0;
        if (creditLimit > 0 && (exposure._sum.balance ?? 0) + total - paidAmount > creditLimit) throw new Error("CREDIT_LIMIT_EXCEEDED");
      }
      const splitTotal = parsed.data.paymentBreakdown?.reduce((sum, payment) => sum + payment.amount, 0);
      const splitMethods = new Set(parsed.data.paymentBreakdown?.map((payment) => payment.method));
      if (parsed.data.paymentMethod === "SPLIT" && (splitTotal !== total || splitMethods.size !== parsed.data.paymentBreakdown?.length)) {
        throw new Error("INVALID_PAID_AMOUNT");
      }
      const receiptDate = new Date();
      const datePart = receiptDate.toISOString().slice(2, 10).replaceAll("-", "");
      const invoiceNumber = `GH-${datePart}-${randomBytes(12).toString("hex").toUpperCase()}`;

      let discountRemaining = parsed.data.discountAmount;
      let taxRemaining = parsed.data.taxAmount;
      const saleLines = lineItems.map((item, index) => {
        const isLast = index === lineItems.length - 1;
        const lineDiscount = isLast ? discountRemaining : proportionalIntegerShare(parsed.data.discountAmount, item.subtotal, subtotal);
        discountRemaining -= lineDiscount;
        const lineTax = isLast ? taxRemaining : proportionalIntegerShare(parsed.data.taxAmount, item.subtotal, subtotal);
        taxRemaining -= lineTax;
        return { ...item, lineDiscount, lineTax, total: item.subtotal - lineDiscount + lineTax };
      });

      const createdSale = await transaction.sale.create({
        data: {
          invoiceNumber,
          branchId,
          cashierId: session.user.id,
          customerId,
          total,
          discountAmount: parsed.data.discountAmount,
          taxAmount: parsed.data.taxAmount,
          paidAmount,
          paymentMethod: parsed.data.paymentMethod,
          status: parsed.data.paymentMethod === "PAY_LINK" ? "PENDING" : paidAmount === total ? "PAID" : "PARTIAL",
          saleItems: {
            create: saleLines.map(({ product, quantity, lineDiscount, lineTax, total: lineTotal }) => ({
              productId: product.id,
              quantity,
              unitPrice: product.sellingPrice,
              unitCost: product.costPrice,
              discountAmount: lineDiscount,
              taxAmount: lineTax,
              total: lineTotal,
            })),
          },
          ...(parsed.data.paymentMethod === "PAY_LINK" ? {} : { payments: {
            create: parsed.data.paymentMethod === "SPLIT"
              ? parsed.data.paymentBreakdown!
              : parsed.data.paymentMethod === "CREDIT"
                ? [{ amount: paidAmount, method: parsed.data.creditDepositMethod!, reference: parsed.data.creditDepositReference || null }]
                : [{ amount: total, method: parsed.data.paymentMethod }],
          } }),
        },
        include: {
          customer: { select: { name: true, phone: true } },
          branch: { select: { name: true, address: true, phone: true } },
          cashier: { select: { name: true } },
          saleItems: { include: { product: { select: { name: true, sku: true, configuration: true, condition: true } } } },
          payments: true,
        },
      });

      let salePaymentLink: { token: string; amount: number } | null = null;
      let payerNotificationId: string | null = null;
      if (parsed.data.paymentMethod === "PAY_LINK") {
        const token = randomBytes(32).toString("hex");
        const paymentRequest = await transaction.paymentRequest.create({
          data: {
            saleId: createdSale.id,
            amount: total,
            purpose: "Product purchase payment",
            tokenHash: createHash("sha256").update(token).digest("hex"),
            targetPhone: payerPhone,
            targetConsentAt: receiptDate,
            expiresAt: new Date(receiptDate.getTime() + 48 * 60 * 60 * 1000),
          },
          select: { id: true },
        });
        salePaymentLink = { token, amount: total };
        const notification = await transaction.customerNotification.create({
          data: {
            branchId,
            channel: "SMS",
            status: "QUEUED",
            kind: "SALE_PAYMENT_LINK",
            recipient: payerPhone!,
            subject: null,
            body: `${createdSale.branch.name}: payment of KES ${total.toLocaleString("en-KE")} is requested for invoice ${createdSale.invoiceNumber}. Pay securely using this link: ${paymentBaseUrl}/request/${token}. The link expires in 48 hours.`,
            dedupeKey: `payer-link:${paymentRequest.id}`,
          },
          select: { id: true },
        });
        payerNotificationId = notification.id;
        await transaction.inventoryMovement.createMany({
          data: saleLines.map(({ product, quantity }) => ({
            branchId, productId: product.id, userId: session.user.id, saleId: createdSale.id,
            type: "RESERVATION", quantity, reference: createdSale.invoiceNumber, note: "Stock reserved while waiting for third-party payment",
          })),
        });
      }

      const creditPlanLinks: { token: string; planReference: string; productName: string; payerToken?: string; payerAmount?: number }[] = [];
      if (parsed.data.paymentMethod === "CREDIT") {
        if (parsed.data.imei && await transaction.creditPlan.findUnique({ where: { imei: parsed.data.imei }, select: { id: true } })) throw new Error("IMEI_ALREADY_REGISTERED");
        let depositRemaining = paidAmount;
        for (let index = 0; index < saleLines.length; index += 1) {
          const line = saleLines[index];
          const allocatedDeposit = index === saleLines.length - 1
            ? depositRemaining
            : proportionalIntegerShare(paidAmount, line.total, total);
          depositRemaining -= allocatedDeposit;
          const lineBalance = line.total - allocatedDeposit;
          const token = randomBytes(32).toString("hex");
          const dueDates = Array.from({ length: parsed.data.creditTermMonths! }, (_, installmentIndex) => {
            const monthStart = new Date(receiptDate.getFullYear(), receiptDate.getMonth() + installmentIndex + 1, 1);
            const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
            monthStart.setDate(Math.min(receiptDate.getDate(), lastDay));
            return monthStart;
          });
          const baseInstallment = Math.floor(lineBalance / parsed.data.creditTermMonths!);
          let remainder = lineBalance % parsed.data.creditTermMonths!;
          const installments = dueDates.map((dueDate, installmentIndex) => {
            const amount = baseInstallment + (remainder > 0 ? 1 : 0);
            remainder = Math.max(0, remainder - 1);
            return { sequence: installmentIndex + 1, dueDate, amount };
          });
          const planReference = `GH${randomBytes(5).toString("hex").toUpperCase()}`;
          const plan = await transaction.creditPlan.create({
            data: {
              planReference,
              saleId: createdSale.id,
              branchId,
              customerId: customerId!,
              productId: line.product.id,
              ...(parsed.data.imei ? { imei: parsed.data.imei } : {}),
              totalAmount: line.total,
              depositAmount: allocatedDeposit,
              balance: lineBalance,
              installmentCount: parsed.data.creditTermMonths!,
              termMonths: parsed.data.creditTermMonths!,
              nextDueDate: dueDates[0],
              portalTokenHash: createHash("sha256").update(token).digest("hex"),
              status: lineBalance === 0 ? "PAID_OFF" : "ACTIVE",
            installments: { create: installments.filter((installment) => installment.amount > 0) },
            },
          });
          let payerToken: string | undefined;
          if (lineBalance > 0) {
            payerToken = randomBytes(32).toString("hex");
            await transaction.paymentRequest.create({
              data: {
                creditPlanId: plan.id,
                amount: lineBalance,
                purpose: `Payment for ${line.product.name}`.slice(0, 120),
                tokenHash: createHash("sha256").update(payerToken).digest("hex"),
                expiresAt: new Date(receiptDate.getTime() + 48 * 60 * 60 * 1000),
              },
            });
          }
          creditPlanLinks.push({ token, planReference, productName: line.product.name, ...(payerToken ? { payerToken, payerAmount: lineBalance } : {}) });
        }
      }

      await transaction.inventoryMovement.createMany({
        data: saleLines.map(({ product, quantity }) => ({
          branchId,
          productId: product.id,
          userId: session.user.id,
          saleId: createdSale.id,
          type: "SALE",
          quantity: -quantity,
          reference: createdSale.invoiceNumber,
        })),
      });

      return { sale: createdSale, creditPlanLinks, salePaymentLink, payerNotificationId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    let payerMessage: { recipient: string; status: "SENT" | "FAILED" | "QUEUED" } | null = null;
    if (sale.payerNotificationId) {
      payerMessage = { recipient: payerPhone!, status: "QUEUED" };
      try {
        const notification = await prisma.customerNotification.findUnique({ where: { id: sale.payerNotificationId } });
        if (notification) {
        const claimed = await prisma.customerNotification.updateMany({ where: { id: notification.id, status: "QUEUED" }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
        if (claimed.count === 1) {
          try {
            await deliverNotification(notification);
            await prisma.customerNotification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
            payerMessage = { recipient: notification.recipient, status: "SENT" };
          } catch (deliveryError) {
            const message = deliveryError instanceof Error ? deliveryError.message.slice(0, 300) : "SMS delivery failed.";
            await prisma.customerNotification.update({ where: { id: notification.id }, data: { status: "FAILED", lastError: message } });
            payerMessage = { recipient: notification.recipient, status: "FAILED" };
          }
        }
        }
      } catch (deliveryError) {
        console.error("Payment link was created, but immediate SMS delivery could not be recorded", sale.payerNotificationId, deliveryError instanceof Error ? deliveryError.message : "unknown error");
      }
    }
    return NextResponse.json({ ...sale.sale, creditPlanLinks: sale.creditPlanLinks, salePaymentLink: sale.salePaymentLink, payerMessage }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK:")) {
      return NextResponse.json({ error: `Insufficient stock for ${error.message.slice("INSUFFICIENT_STOCK:".length)}.` }, { status: 409 });
    }
    if (error instanceof Error && error.message === "DISCOUNT_EXCEEDS_SUBTOTAL") return NextResponse.json({ error: "Discount cannot exceed the sale subtotal." }, { status: 400 });
    if (error instanceof Error && error.message === "DEPOSIT_EXCEEDS_TOTAL") return NextResponse.json({ error: "The deposit cannot exceed the total sale amount." }, { status: 400 });
    if (error instanceof Error && error.message === "DEPOSIT_BELOW_POLICY") return NextResponse.json({ error: "The deposit is below the minimum required by this branch's Lipa policy." }, { status: 400 });
    if (error instanceof Error && error.message === "CREDIT_LIMIT_EXCEEDED") return NextResponse.json({ error: "This sale would exceed the customer's available Lipa credit limit." }, { status: 409 });
    if (error instanceof Error && error.message === "CUSTOMER_CREDIT_HOLD") return NextResponse.json({ error: "This customer is on credit hold. Cash and card purchases can still be recorded." }, { status: 409 });
    if (error instanceof Error && error.message === "IMEI_ALREADY_REGISTERED") return NextResponse.json({ error: "This IMEI is already attached to a Lipa account." }, { status: 409 });
    if (error instanceof Error && error.message === "INVALID_PAID_AMOUNT") return NextResponse.json({ error: "Use two distinct payment methods whose amounts add up to the sale total." }, { status: 400 });
    if (error instanceof Error && error.message === "SALE_AMOUNT_OUT_OF_RANGE") return NextResponse.json({ error: "Sale total exceeds the supported integer amount or contains an invalid price." }, { status: 400 });
    if (error instanceof Error && error.message === "PRODUCT_UNAVAILABLE") {
      return NextResponse.json({ error: "One or more products are unavailable at your branch." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CUSTOMER_UNAVAILABLE") {
      return NextResponse.json({ error: "That customer is not active at your branch." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another checkout changed inventory. Refresh and try again." }, { status: 409 });
    }
    console.error("POS checkout failed", error);
    return NextResponse.json({ error: "Sale could not be completed. No stock was deducted." }, { status: 500 });
  }
}
