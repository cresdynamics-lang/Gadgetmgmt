import type { PrismaClient } from "@prisma/client";

import {
  fallbackCustomerName,
  filledContact,
  hasTwoContacts,
  mergeCustomerFields,
  phoneKeys,
  selectCustomerMatch,
  type CustomerContact,
} from "./retain-customer";

export async function upsertWebsiteCustomer(
  prisma: PrismaClient,
  input: CustomerContact & { source?: string },
) {
  if (!hasTwoContacts(input)) return { skipped: true as const, reason: "need two of name, email, phone" };
  const filled = filledContact(input);
  const branch = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!branch) return { skipped: true as const, reason: "no active branch" };

  const or = [
    ...(filled.phone ? [{ phone: { in: phoneKeys(filled.phone) } }] : []),
    ...(filled.email ? [{ email: { equals: filled.email, mode: "insensitive" as const } }] : []),
  ];
  const candidates = or.length
    ? await prisma.customer.findMany({
        where: { branchId: branch.id, OR: or },
        select: { id: true, name: true, email: true, phone: true },
        take: 20,
      })
    : [];

  const match = selectCustomerMatch(input, candidates);
  if (match) {
    const { next, changed } = mergeCustomerFields(match, input);
    if (!changed) return { skipped: false as const, id: match.id, created: false };
    const updated = await prisma.customer.update({
      where: { id: match.id },
      data: { name: next.name, email: next.email, phone: next.phone },
      select: { id: true },
    });
    return { skipped: false as const, id: updated.id, created: false };
  }

  const created = await prisma.customer.create({
    data: {
      name: fallbackCustomerName(input),
      phone:
        (filled.phone && phoneKeys(filled.phone).find((key) => key.startsWith("254"))) ||
        filled.phone ||
        (filled.email ? `web:${filled.email}` : "web:unknown"),
      email: filled.email || null,
      branchId: branch.id,
    },
    select: { id: true },
  });
  return { skipped: false as const, id: created.id, created: true };
}
