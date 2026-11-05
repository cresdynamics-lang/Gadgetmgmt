import type { Prisma, PrismaClient } from "@prisma/client";

import { filledContact, phoneKeys, selectCustomerMatch, type CustomerContact } from "@/lib/retain-customer";

type Db = PrismaClient | Prisma.TransactionClient;

/** A client already on file at this branch with the same phone (any format) or email, so repeat visits stay one record. */
export async function findReturningCustomer(db: Db, branchId: string, input: CustomerContact) {
  const filled = filledContact(input);
  const phones = filled.phone ? phoneKeys(filled.phone) : [];
  if (!phones.length && !filled.email) return null;
  const candidates = await db.customer.findMany({
    where: {
      branchId,
      OR: [
        ...phones.map((phone) => ({ phone })),
        ...(filled.email ? [{ email: { equals: filled.email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true, _count: { select: { sales: true } } },
    take: 10,
  });
  const match = selectCustomerMatch(input, candidates);
  return match ? candidates.find((row) => row.id === match.id) ?? null : null;
}
