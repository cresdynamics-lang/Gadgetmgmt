import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, canUseCapability } from "@/lib/access";
import { denied } from "@/lib/authz";
import { queueAndSendNotice } from "@/lib/customer-notice";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  id: z.string().cuid(),
  assignedToId: z.string().cuid().nullable().optional(),
  status: z.enum(["OPEN", "ASSIGNED", "DONE"]).optional(),
  note: z.string().trim().max(300).optional(),
}).strict();

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "notifications")) return denied(session.user, "notifications", "Your role cannot assign follow-ups.");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid follow-up, teammate or status." }, { status: 400 });

  const followUp = await prisma.collectionFollowUp.findFirst({
    where: { id: parsed.data.id, ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }) },
    select: { id: true, branchId: true, customerName: true, amount: true, dueDate: true },
  });
  if (!followUp) return NextResponse.json({ error: "That follow-up is not available." }, { status: 404 });

  const assignedToId = parsed.data.assignedToId === undefined ? undefined : parsed.data.assignedToId;
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, status: "ACTIVE", ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }) },
      select: { id: true, email: true, name: true },
    });
    if (!assignee) return NextResponse.json({ error: "Choose an active teammate at this branch." }, { status: 400 });
    const due = followUp.dueDate.toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });
    await queueAndSendNotice({
      branchId: followUp.branchId,
      channel: "EMAIL",
      kind: "FOLLOW_UP_ASSIGNED",
      recipient: assignee.email,
      subject: `Follow up ${followUp.customerName} · KES ${followUp.amount.toLocaleString("en-KE")}`,
      body: `${assignee.name}, you have been assigned to follow up ${followUp.customerName} for KES ${followUp.amount.toLocaleString("en-KE")} due ${due}. Open Messages & alerts in Gadget Hub.`,
      dedupeKey: `follow-up-assigned:${followUp.id}:${assignee.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  const updated = await prisma.collectionFollowUp.update({
    where: { id: followUp.id },
    data: {
      ...(assignedToId !== undefined ? { assignedToId, status: assignedToId ? "ASSIGNED" : "OPEN" } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(updated);
}
