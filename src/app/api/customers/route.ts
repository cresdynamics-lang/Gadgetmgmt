import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const lateStatuses = ["DUE", "GRACE", "LATE_1", "LATE_2", "LATE_3", "RECOVERY", "OVERDUE"] as const;
const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  creditLimit: z.number().int().nonnegative().default(0),
  smsRemindersEnabled: z.boolean().default(false),
  emailRemindersEnabled: z.boolean().default(false),
  whatsappRemindersEnabled: z.boolean().default(false),
  branchId: z.string().cuid().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "customers")) return NextResponse.json({ error: "Your role cannot access customers." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 100);
  const filter = params.get("filter") ?? "ALL";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const pageSize = 30;
  const ownerBranch = session.user.role === "OWNER" ? params.get("branchId") : null;
  const scope: Prisma.CustomerWhereInput = {
    ...(session.user.role === "OWNER" ? (ownerBranch ? { branchId: ownerBranch } : {}) : { branchId: session.user.branchId ?? "" }),
  };
  const clauses: Prisma.CustomerWhereInput[] = [scope];
  if (query) clauses.push({ OR: [
    { name: { contains: query, mode: "insensitive" } },
    { phone: { contains: query } },
    { email: { contains: query, mode: "insensitive" } },
  ] });
  if (filter === "ACTIVE" || filter === "INACTIVE" || filter === "CREDIT_HOLD") clauses.push({ status: filter });
  if (filter === "ATTENTION") clauses.push({ OR: [
    { status: "CREDIT_HOLD" },
    { creditPlans: { some: { status: { in: [...lateStatuses] } } } },
  ] });
  const where: Prisma.CustomerWhereInput = { AND: clauses };

  const [customers, total, allCount, activeCount, attentionCount] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true, name: true, phone: true, email: true, status: true, creditLimit: true,
        reliabilityScore: true, smsRemindersEnabled: true, emailRemindersEnabled: true,
        whatsappRemindersEnabled: true, remindersConsentAt: true, whatsappConsentAt: true,
        createdAt: true, branch: { select: { name: true } },
        _count: { select: { sales: true, creditPlans: true } },
        sales: { take: 6, orderBy: { createdAt: "desc" }, select: { id: true, invoiceNumber: true, total: true, paymentMethod: true, createdAt: true, saleItems: { select: { product: { select: { name: true } }, quantity: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
    prisma.customer.count({ where: scope }),
    prisma.customer.count({ where: { ...scope, status: "ACTIVE" } }),
    prisma.customer.count({ where: { ...scope, OR: [{ status: "CREDIT_HOLD" }, { creditPlans: { some: { status: { in: [...lateStatuses] } } } }] } }),
  ]);

  const customerIds = customers.map((customer) => customer.id);
  const [balances, latePlans] = customerIds.length ? await Promise.all([
    prisma.creditPlan.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, balance: { gt: 0 } }, _sum: { balance: true }, _count: { _all: true }, _min: { nextDueDate: true } }),
    prisma.creditPlan.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, status: { in: [...lateStatuses] } }, _count: { _all: true } }),
  ]) : [[], []];
  const balanceByCustomer = new Map(balances.map((entry) => [entry.customerId, entry]));
  const lateByCustomer = new Map(latePlans.map((entry) => [entry.customerId, entry._count._all]));

  return NextResponse.json({
    customers: customers.map((customer) => {
      const accounts = balanceByCustomer.get(customer.id);
      return { ...customer, openBalance: accounts?._sum.balance ?? 0, activePlanCount: accounts?._count._all ?? 0, nextDueDate: accounts?._min.nextDueDate ?? null, overduePlanCount: lateByCustomer.get(customer.id) ?? 0 };
    }),
    pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    summary: { total: allCount, active: activeCount, attention: attentionCount },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "customers")) return NextResponse.json({ error: "Your role cannot create customers." }, { status: 403 });

  const parsed = customerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, phone, email and credit limit." }, { status: 400 });

  const branchId = session.user.role === "OWNER" ? parsed.data.branchId ?? session.user.branchId : session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Select a branch before creating a customer." }, { status: 400 });

  const customer = await prisma.customer.create({
    data: {
      name: parsed.data.name, phone: parsed.data.phone, email: parsed.data.email || null,
      creditLimit: parsed.data.creditLimit, smsRemindersEnabled: parsed.data.smsRemindersEnabled,
      emailRemindersEnabled: parsed.data.emailRemindersEnabled, whatsappRemindersEnabled: parsed.data.whatsappRemindersEnabled,
      whatsappConsentAt: parsed.data.whatsappRemindersEnabled ? new Date() : null,
      remindersConsentAt: parsed.data.smsRemindersEnabled || parsed.data.emailRemindersEnabled ? new Date() : null,
      branchId,
    },
    include: { branch: { select: { name: true } } },
  });
  return NextResponse.json(customer, { status: 201 });
}
