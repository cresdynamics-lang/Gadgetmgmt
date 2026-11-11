import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const lateStatuses = ["DUE", "GRACE", "LATE_1", "LATE_2", "LATE_3", "RECOVERY", "OVERDUE"] as const;

type DirectoryUser = { role: string; branchId: string | null };

export async function customerDirectory(user: DirectoryUser, input: { query?: string; filter?: string; page?: number; branchId?: string | null }) {
  const query = (input.query ?? "").trim().slice(0, 100);
  const filter = input.filter ?? "ALL";
  const page = Math.max(1, Math.min(10_000, input.page ?? 1));
  const pageSize = 30;
  const ownerBranch = user.role === "OWNER" ? input.branchId ?? null : null;
  const scope: Prisma.CustomerWhereInput = {
    ...(user.role === "OWNER" ? (ownerBranch ? { branchId: ownerBranch } : {}) : { branchId: user.branchId ?? "" }),
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
  const balances = customerIds.length
    ? await prisma.creditPlan.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, balance: { gt: 0 } }, _sum: { balance: true }, _count: { _all: true }, _min: { nextDueDate: true } })
    : [];
  const latePlans = customerIds.length
    ? await prisma.creditPlan.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, status: { in: [...lateStatuses] } }, _count: { _all: true } })
    : [];
  const balanceByCustomer = new Map(balances.map((entry) => [entry.customerId, entry]));
  const lateByCustomer = new Map(latePlans.map((entry) => [entry.customerId, entry._count._all]));

  return {
    customers: customers.map((customer) => {
      const accounts = balanceByCustomer.get(customer.id);
      return { ...customer, openBalance: accounts?._sum.balance ?? 0, activePlanCount: accounts?._count._all ?? 0, nextDueDate: accounts?._min.nextDueDate ?? null, overduePlanCount: lateByCustomer.get(customer.id) ?? 0 };
    }),
    pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    summary: { total: allCount, active: activeCount, attention: attentionCount },
  };
}
