import { canSeeAllBranches, hasPermission, type AccessSubject, type Permission } from "@/lib/access";
import { daysUntilDue, flaggedCreditStatuses } from "@/lib/credit-lifecycle";
import { prisma } from "@/lib/prisma";
import { addDays, nairobiDateKey, nairobiMidnight, startOfNairobiDay, startOfNairobiMonth, startOfNairobiWeek, startOfNextNairobiMonth } from "@/lib/sales-periods";

/**
 * Read-only tools the AI assistant can call. Each tool needs a permission: the assistant is only
 * offered the tools the signed-in person holds, and every tool checks again before it runs, so
 * data a person may not see never reaches the model.
 */
export type AssistantUser = Exclude<AccessSubject, string | null | undefined> & { id: string; branchId: string | null; name?: string | null };

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
type ToolArgs = Record<string, unknown>;

export type AssistantTool = {
  name: string;
  label: string;
  description: string;
  /** All of these are needed to use the tool. */
  permissions: Permission[];
  parameters: JsonSchema;
  run: (args: ToolArgs, user: AssistantUser, now: Date) => Promise<unknown>;
};

const PERIODS = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom"] as const;
const periodParameter = {
  period: { type: "string", enum: PERIODS, description: "Time period. Weeks run Monday to Sunday, Nairobi time." },
  from: { type: "string", description: "Start date YYYY-MM-DD, only for period=custom." },
  to: { type: "string", description: "End date YYYY-MM-DD (inclusive), only for period=custom." },
};

function resolvePeriod(args: ToolArgs, now: Date) {
  const period = PERIODS.includes(args.period as (typeof PERIODS)[number]) ? args.period as (typeof PERIODS)[number] : "today";
  const today = startOfNairobiDay(now);
  if (period === "yesterday") return { period, start: addDays(today, -1), end: today };
  if (period === "this_week") return { period, start: startOfNairobiWeek(now), end: addDays(startOfNairobiWeek(now), 7) };
  if (period === "last_week") return { period, start: addDays(startOfNairobiWeek(now), -7), end: startOfNairobiWeek(now) };
  if (period === "this_month") return { period, start: startOfNairobiMonth(now), end: startOfNextNairobiMonth(now) };
  if (period === "last_month") {
    const start = startOfNairobiMonth(addDays(startOfNairobiMonth(now), -1));
    return { period, start, end: startOfNairobiMonth(now) };
  }
  if (period === "custom" && typeof args.from === "string" && typeof args.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.from) && /^\d{4}-\d{2}-\d{2}$/.test(args.to)) {
    const [from, to] = args.from <= args.to ? [args.from, args.to] : [args.to, args.from];
    return { period, start: nairobiMidnight(from), end: addDays(nairobiMidnight(to), 1) };
  }
  return { period: "today" as const, start: today, end: addDays(today, 1) };
}

const branchScope = (user: AssistantUser) => canSeeAllBranches(user) ? {} : { branchId: user.branchId ?? "" };
const completed = { in: ["PAID", "PARTIAL"] as ("PAID" | "PARTIAL")[] };
const day = (date: Date | null | undefined) => date ? nairobiDateKey(date) : null;
const limitArg = (value: unknown, fallback: number, max: number) => Math.min(max, Math.max(1, Math.trunc(Number(value) || fallback)));
const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 80) : "";

const salesSummary: AssistantTool = {
  name: "sales_summary",
  label: "Sales",
  description: "Total sales value, number of sales, units sold, average sale, top products, and sales by team member and product type for a period.",
  permissions: ["reports.view"],
  parameters: { type: "object", properties: periodParameter, required: ["period"], additionalProperties: false },
  async run(args, user, now) {
    const { period, start, end } = resolvePeriod(args, now);
    const sales = await prisma.sale.findMany({
      where: { ...branchScope(user), status: completed, createdAt: { gte: start, lt: end } },
      select: { total: true, tradeInValue: true, paymentMethod: true, cashier: { select: { name: true } }, saleItems: { select: { quantity: true, total: true, unitCost: true, product: { select: { name: true, category: true } } } } },
    });
    const byStaff = new Map<string, { sales: number; value: number }>();
    const byCategory = new Map<string, { units: number; value: number }>();
    const byProduct = new Map<string, { units: number; value: number }>();
    let units = 0;
    let grossProfit = 0;
    for (const sale of sales) {
      const staff = byStaff.get(sale.cashier.name) ?? { sales: 0, value: 0 };
      staff.sales += 1; staff.value += sale.total; byStaff.set(sale.cashier.name, staff);
      for (const line of sale.saleItems) {
        units += line.quantity;
        grossProfit += line.total - line.unitCost * line.quantity;
        const category = byCategory.get(line.product.category) ?? { units: 0, value: 0 };
        category.units += line.quantity; category.value += line.total; byCategory.set(line.product.category, category);
        const product = byProduct.get(line.product.name) ?? { units: 0, value: 0 };
        product.units += line.quantity; product.value += line.total; byProduct.set(line.product.name, product);
      }
    }
    const value = sales.reduce((sum, sale) => sum + sale.total, 0);
    return {
      period, from: day(start), to: day(addDays(end, -1)), currency: "KES",
      salesValue: value, numberOfSales: sales.length, unitsSold: units, averageSale: sales.length ? Math.round(value / sales.length) : 0,
      lipaSales: sales.filter((sale) => sale.paymentMethod === "CREDIT").length,
      tradeIns: sales.filter((sale) => sale.tradeInValue > 0).length,
      byTeamMember: [...byStaff].map(([name, row]) => ({ name, ...row })).sort((a, b) => b.value - a.value),
      byProductType: [...byCategory].map(([type, row]) => ({ type, ...row })).sort((a, b) => b.value - a.value),
      topProducts: [...byProduct].map(([name, row]) => ({ name, ...row })).sort((a, b) => b.value - a.value).slice(0, 10),
      ...(hasPermission(user, "finance.view") ? { grossProfit, note: "Gross profit uses recorded buying prices; products without a buying price count as zero cost." } : {}),
    };
  },
};

const moneyIn: AssistantTool = {
  name: "money_received",
  label: "Money received",
  description: "Money actually received in a period: sale payments by method (cash, M-Pesa, card) and Lipa Mdogo Mdogo installment collections, with the latest Lipa payments.",
  permissions: ["finance.view"],
  parameters: { type: "object", properties: periodParameter, required: ["period"], additionalProperties: false },
  async run(args, user, now) {
    const { period, start, end } = resolvePeriod(args, now);
    const scope = branchScope(user);
    const [byMethod, lipa, latest] = await Promise.all([
      prisma.salePayment.groupBy({ by: ["method"], where: { createdAt: { gte: start, lt: end }, sale: scope }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { createdAt: { gte: start, lt: end }, creditPlan: scope }, _sum: { amount: true }, _count: true }),
      prisma.payment.findMany({ where: { createdAt: { gte: start, lt: end }, creditPlan: scope }, orderBy: { createdAt: "desc" }, take: 15, select: { amount: true, method: true, createdAt: true, creditPlan: { select: { planReference: true, customer: { select: { name: true } } } } } }),
    ]);
    const salePayments = byMethod.map((row) => ({ method: row.method, amount: row._sum.amount ?? 0, count: row._count }));
    const lipaTotal = lipa._sum.amount ?? 0;
    return {
      period, from: day(start), to: day(addDays(end, -1)), currency: "KES",
      salePayments, lipaInstallments: { amount: lipaTotal, count: lipa._count },
      totalReceived: salePayments.reduce((sum, row) => sum + row.amount, 0) + lipaTotal,
      mpesaSettlesTo: process.env.MPESA_SETTLEMENT_BANK || "Stanbic Bank",
      latestLipaPayments: latest.map((payment) => ({ customer: payment.creditPlan.customer.name, plan: payment.creditPlan.planReference, amount: payment.amount, method: payment.method, date: day(payment.createdAt) })),
    };
  },
};

const lipaAccounts: AssistantTool = {
  name: "lipa_accounts",
  label: "Lipa accounts",
  description: "Lipa Mdogo Mdogo (installment) accounts with money still owed: who has not paid, who needs to pay, how much is due next and when, how many days overdue, and whether the account is flagged.",
  permissions: ["credit.view"],
  parameters: {
    type: "object",
    properties: {
      filter: { type: "string", enum: ["overdue", "flagged", "due_today", "due_next_7_days", "all_outstanding"], description: "overdue = past the due date; flagged = 3+ days overdue and on hold." },
      limit: { type: "integer", description: "Maximum rows (default 25, max 100)." },
    },
    required: ["filter"],
    additionalProperties: false,
  },
  async run(args, user, now) {
    const today = startOfNairobiDay(now);
    const filter = String(args.filter);
    const dueWhere = filter === "overdue" ? { nextDueDate: { lt: today } }
      : filter === "due_today" ? { nextDueDate: { gte: today, lt: addDays(today, 1) } }
        : filter === "due_next_7_days" ? { nextDueDate: { gte: today, lt: addDays(today, 8) } }
          : filter === "flagged" ? { status: { in: [...flaggedCreditStatuses] } }
            : {};
    const where = { ...branchScope(user), balance: { gt: 0 }, NOT: { status: "PAID_OFF" as const }, ...dueWhere };
    const [plans, totals] = await Promise.all([
      prisma.creditPlan.findMany({
        where,
        orderBy: { nextDueDate: "asc" },
        take: limitArg(args.limit, 25, 100),
        select: {
          planReference: true, balance: true, totalAmount: true, depositAmount: true, nextDueDate: true, status: true, termMonths: true,
          customer: { select: { name: true, phone: true, email: true, status: true, flaggedAt: true } },
          product: { select: { name: true } },
          installments: { where: { paidAt: null }, orderBy: { sequence: "asc" }, take: 1, select: { sequence: true, amount: true, paidAmount: true, dueDate: true } },
        },
      }),
      prisma.creditPlan.aggregate({ where, _sum: { balance: true }, _count: true }),
    ]);
    return {
      filter, currency: "KES", accounts: totals._count, totalOwed: totals._sum.balance ?? 0,
      rows: plans.map((plan) => {
        const next = plan.installments[0];
        const days = daysUntilDue(plan.nextDueDate, now);
        return {
          customer: plan.customer.name, phone: plan.customer.phone, email: plan.customer.email, plan: plan.planReference, product: plan.product.name,
          balanceOwed: plan.balance, nextInstallment: next ? { number: next.sequence, amountDue: next.amount - next.paidAmount, dueDate: day(next.dueDate) } : null,
          nextDueDate: day(plan.nextDueDate), daysOverdue: days < 0 ? -days : 0, daysUntilDue: days >= 0 ? days : 0,
          status: plan.status, flagged: Boolean(plan.customer.flaggedAt),
        };
      }),
    };
  },
};

const customerDetails: AssistantTool = {
  name: "customer_details",
  label: "Customers",
  description: "Look up customers by name or phone: contact details and status, plus their Lipa accounts and recent purchases where permitted.",
  permissions: ["customers.view"],
  parameters: { type: "object", properties: { query: { type: "string", description: "Part of the customer's name or phone number." } }, required: ["query"], additionalProperties: false },
  async run(args, user) {
    const query = text(args.query);
    if (query.length < 2) return { error: "Give at least 2 characters of a name or phone number." };
    const canSeeCredit = hasPermission(user, "credit.view");
    const canSeeSales = hasPermission(user, "reports.view");
    const customers = await prisma.customer.findMany({
      where: { ...branchScope(user), OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query.replace(/\s/g, "") } }] },
      take: 10,
      select: {
        name: true, phone: true, email: true, status: true, flaggedAt: true, flagReason: true, reliabilityScore: true, creditLimit: true, createdAt: true,
        // Loaded for everyone, but only passed on below when the person may see it.
        creditPlans: { select: { planReference: true, balance: true, totalAmount: true, nextDueDate: true, status: true, product: { select: { name: true } } } },
        sales: { where: { status: completed }, orderBy: { createdAt: "desc" }, take: 5, select: { invoiceNumber: true, total: true, createdAt: true, paymentMethod: true } },
      },
    });
    return {
      matches: customers.map((customer) => ({
        name: customer.name, phone: customer.phone, email: customer.email, status: customer.status, flagged: Boolean(customer.flaggedAt), flagReason: customer.flagReason,
        reliabilityScore: customer.reliabilityScore, customerSince: day(customer.createdAt),
        ...(canSeeCredit ? { lipaAccounts: customer.creditPlans.map((plan) => ({ plan: plan.planReference, product: plan.product.name, owed: plan.balance, total: plan.totalAmount, nextDue: day(plan.nextDueDate), status: plan.status })) } : {}),
        ...(canSeeSales ? { recentPurchases: customer.sales.map((sale) => ({ invoice: sale.invoiceNumber, total: sale.total, date: day(sale.createdAt), paidBy: sale.paymentMethod })) } : {}),
      })),
    };
  },
};

const stockLevels: AssistantTool = {
  name: "stock_levels",
  label: "Stock",
  description: "Products in stock: units on hand, reserved and available, selling price, condition (New, Ex-UK, Trade-in), and which items need reordering.",
  permissions: ["inventory.view"],
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Optional product name, SKU or type to filter by." },
      only: { type: "string", enum: ["all", "in_stock", "out_of_stock", "needs_reorder"] },
    },
    additionalProperties: false,
  },
  async run(args, user) {
    const query = text(args.query);
    const canSeeCost = hasPermission(user, "finance.view");
    const items = await prisma.inventoryItem.findMany({
      where: { ...branchScope(user), ...(query ? { product: { OR: [{ name: { contains: query, mode: "insensitive" } }, { sku: { contains: query, mode: "insensitive" } }, { category: { contains: query, mode: "insensitive" } }] } } : {}) },
      select: { stockOnHand: true, reservedStock: true, reorderLevel: true, product: { select: { name: true, sku: true, category: true, condition: true, sellingPrice: true, costPrice: true, reorderLevel: true } } },
      orderBy: { product: { name: "asc" } },
    });
    const rows = items.map((item) => {
      const available = item.stockOnHand - item.reservedStock;
      const reorderAt = Math.max(item.reorderLevel, item.product.reorderLevel);
      return {
        product: item.product.name, sku: item.product.sku, type: item.product.category, condition: item.product.condition,
        onHand: item.stockOnHand, reserved: item.reservedStock, available, sellingPrice: item.product.sellingPrice,
        needsReorder: reorderAt > 0 && available <= reorderAt,
        ...(canSeeCost ? { buyingPrice: item.product.costPrice || null } : {}),
      };
    }).filter((row) => args.only === "in_stock" ? row.available > 0 : args.only === "out_of_stock" ? row.available <= 0 : args.only === "needs_reorder" ? row.needsReorder : true);
    return {
      currency: "KES", products: rows.length, unitsOnHand: rows.reduce((sum, row) => sum + row.onHand, 0),
      ...(canSeeCost ? { stockValueAtCost: items.reduce((sum, item) => sum + item.stockOnHand * item.product.costPrice, 0) } : {}),
      rows: rows.slice(0, 80),
    };
  },
};

const recentSales: AssistantTool = {
  name: "sales_list",
  label: "Sales list",
  description: "Individual sales in a period: invoice, date, items, total, how it was paid, who sold it and the customer. Optionally filter by team member name.",
  permissions: ["reports.view"],
  parameters: { type: "object", properties: { ...periodParameter, team_member: { type: "string" }, limit: { type: "integer", description: "Default 20, max 50." } }, required: ["period"], additionalProperties: false },
  async run(args, user, now) {
    const { period, start, end } = resolvePeriod(args, now);
    const member = text(args.team_member);
    const sales = await prisma.sale.findMany({
      where: { ...branchScope(user), status: completed, createdAt: { gte: start, lt: end }, ...(member ? { cashier: { name: { contains: member, mode: "insensitive" } } } : {}) },
      orderBy: { createdAt: "desc" },
      take: limitArg(args.limit, 20, 50),
      select: { invoiceNumber: true, total: true, paidAmount: true, paymentMethod: true, createdAt: true, cashier: { select: { name: true } }, customer: { select: { name: true } }, saleItems: { select: { quantity: true, product: { select: { name: true } } } } },
    });
    return {
      period, from: day(start), to: day(addDays(end, -1)), currency: "KES",
      sales: sales.map((sale) => ({ invoice: sale.invoiceNumber, date: sale.createdAt.toISOString(), total: sale.total, paid: sale.paidAmount, paidBy: sale.paymentMethod === "CREDIT" ? "Lipa Mdogo Mdogo" : sale.paymentMethod, soldBy: sale.cashier.name, customer: sale.customer?.name ?? "Walk-in", items: sale.saleItems.map((line) => `${line.quantity} × ${line.product.name}`) })),
    };
  },
};

const goals: AssistantTool = {
  name: "sales_goals",
  label: "Goals",
  description: "Active sales goals (daily, weekly, monthly, custom dates) and progress against each.",
  permissions: ["reports.view"],
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(_args, user, now) {
    const targets = await prisma.salesTarget.findMany({ where: { isActive: true } });
    const windowFor = (target: (typeof targets)[number]) => target.period === "DAILY" ? [startOfNairobiDay(now), addDays(startOfNairobiDay(now), 1)]
      : target.period === "WEEKLY" ? [startOfNairobiWeek(now), addDays(startOfNairobiWeek(now), 7)]
        : target.period === "MONTHLY" ? [startOfNairobiMonth(now), startOfNextNairobiMonth(now)]
          : [target.startsAt ?? now, target.endsAt ? addDays(target.endsAt, 1) : now];
    return {
      currency: "KES",
      goals: await Promise.all(targets.map(async (target) => {
        const [from, to] = windowFor(target);
        const total = await prisma.sale.aggregate({ where: { ...branchScope(user), status: completed, createdAt: { gte: from, lt: to } }, _sum: { total: true } });
        const achieved = total._sum.total ?? 0;
        return { period: target.period, label: target.label, goal: target.amount, achieved, percent: target.amount ? Math.round((achieved / target.amount) * 100) : 0, from: day(from), to: day(addDays(to, -1)) };
      })),
    };
  },
};

const activityLog: AssistantTool = {
  name: "activity_log",
  label: "Activity",
  description: "What staff did in the system in a period: sign-ins, sales, stock received, trade-ins, price changes, permission and approval events.",
  permissions: ["activity.view"],
  parameters: { type: "object", properties: { ...periodParameter, team_member: { type: "string" } }, required: ["period"], additionalProperties: false },
  async run(args, _user, now) {
    const { period, start, end } = resolvePeriod(args, now);
    const member = text(args.team_member);
    const events = await prisma.activityEvent.findMany({
      where: { createdAt: { gte: start, lt: end }, ...(member ? { user: { name: { contains: member, mode: "insensitive" } } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { action: true, summary: true, createdAt: true, user: { select: { name: true } } },
    });
    return { period, from: day(start), to: day(addDays(end, -1)), events: events.map((event) => ({ when: event.createdAt.toISOString(), who: event.user?.name ?? "System", action: event.action, summary: event.summary })) };
  },
};

const staffList: AssistantTool = {
  name: "staff_list",
  label: "Staff",
  description: "Team members, their role, status and branch.",
  permissions: ["staff.view"],
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(_args, user) {
    const staff = await prisma.user.findMany({ where: branchScope(user), select: { name: true, email: true, role: true, status: true, branch: { select: { name: true } } }, orderBy: { name: "asc" } });
    return { staff: staff.map((member) => ({ name: member.name, email: member.email, role: member.role, status: member.status, branch: member.branch?.name ?? null })) };
  },
};

// Owner-only free-form reads. Secrets (password and token hashes, approval codes) are never returned.
const queryableModels = ["branch", "user", "customer", "product", "inventoryItem", "sale", "salePayment", "saleItem", "creditPlan", "creditPolicy", "creditInstallment", "creditRescheduleRequest", "creditPaymentSubmission", "payment", "paymentRequest", "mpesaC2BTransaction", "layawayOrder", "layawayPayment", "inventoryMovement", "customerNotification", "collectionFollowUp", "activityEvent", "salesTarget", "tradeIn", "userPermission", "scheduledJobRun", "customerReliabilityEvent"] as const;
const SECRET_KEY = /hash$|secret|password|^token/i;

export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)).map(([key, inner]) => [key, stripSecrets(inner)]));
  }
  return value;
}

type ReadDelegate = Record<"findMany" | "count" | "aggregate" | "groupBy", (args: Record<string, unknown>) => Promise<unknown>>;

const queryDatabase: AssistantTool = {
  name: "query_database",
  label: "Database",
  description: `Read any business record directly (super admin only) when the other tools do not cover the question. Uses Prisma query syntax. Models: ${queryableModels.join(", ")}. Money is whole KES. Dates are ISO strings.`,
  permissions: ["permissions.manage", "scope.allBranches"],
  parameters: {
    type: "object",
    properties: {
      model: { type: "string", enum: queryableModels },
      operation: { type: "string", enum: ["findMany", "count", "aggregate", "groupBy"] },
      args: { type: "object", description: "Prisma arguments, e.g. {\"where\":{...},\"select\":{...},\"orderBy\":{...},\"take\":20} or for groupBy {\"by\":[...],\"_sum\":{...}}." },
    },
    required: ["model", "operation"],
    additionalProperties: false,
  },
  async run(args) {
    const model = queryableModels.find((name) => name === args.model);
    const operation = ["findMany", "count", "aggregate", "groupBy"].find((name) => name === args.operation) as keyof ReadDelegate | undefined;
    if (!model || !operation) return { error: "Unknown model or operation." };
    const queryArgs = args.args && typeof args.args === "object" && !Array.isArray(args.args) ? { ...(args.args as Record<string, unknown>) } : {};
    if (operation === "findMany") queryArgs.take = limitArg(queryArgs.take, 50, 100);
    try {
      const delegate = (prisma as unknown as Record<string, ReadDelegate>)[model];
      return { model, operation, result: stripSecrets(await delegate[operation](queryArgs)) };
    } catch (error) {
      return { error: error instanceof Error ? error.message.split("\n").slice(-3).join(" ").slice(0, 400) : "Query failed." };
    }
  },
};

export const assistantTools: AssistantTool[] = [salesSummary, moneyIn, lipaAccounts, customerDetails, stockLevels, recentSales, goals, activityLog, staffList, queryDatabase];

/** The tools this person may use. Tools outside their permissions are never offered to the model. */
export function toolsFor(user: AssistantUser) {
  return assistantTools.filter((tool) => tool.permissions.every((permission) => hasPermission(user, permission)));
}

/** Run a tool by name, re-checking permissions at the moment of use. */
export async function runTool(name: string, args: ToolArgs, user: AssistantUser, now: Date) {
  const tool = assistantTools.find((candidate) => candidate.name === name);
  if (!tool) return { error: `There is no tool called ${name}.` };
  if (!tool.permissions.every((permission) => hasPermission(user, permission))) {
    return { error: "This person does not have permission to see this information." };
  }
  return tool.run(args, user, now);
}
