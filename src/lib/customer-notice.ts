import { prisma } from "@/lib/prisma";
import { deliverNotification } from "@/lib/notifications";

export async function queueAndSendNotice(input: {
  branchId: string;
  customerId?: string | null;
  channel: "EMAIL" | "SMS" | "WHATSAPP";
  kind: string;
  recipient: string;
  subject: string;
  body: string;
  dedupeKey: string;
}) {
  try {
    await prisma.customerNotification.create({
      data: {
        branchId: input.branchId,
        customerId: input.customerId ?? null,
        channel: input.channel,
        kind: input.kind,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        dedupeKey: input.dedupeKey,
        status: "QUEUED",
      },
    });
  } catch {
    return { sent: false, skipped: true };
  }
  const notification = await prisma.customerNotification.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (!notification || notification.status === "SENT") return { sent: notification?.status === "SENT", skipped: true };
  const claimed = await prisma.customerNotification.updateMany({
    where: { id: notification.id, status: { in: ["QUEUED", "FAILED"] } },
    data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count !== 1) return { sent: false, skipped: true };
  try {
    await deliverNotification(notification);
    await prisma.customerNotification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
    return { sent: true, skipped: false };
  } catch (error) {
    const failure = error instanceof Error ? error.message.slice(0, 300) : "Delivery failed.";
    await prisma.customerNotification.update({ where: { id: notification.id }, data: { status: "FAILED", lastError: failure } });
    return { sent: false, skipped: false };
  }
}
