import { getCompanyEmailSettings } from "@/lib/email-settings";
import { notificationApi } from "@/lib/notification-api";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/entitlements";
import { rejectSensitiveQuery } from "@/lib/request-guards";
import { prisma } from "@/lib/prisma";

async function handleGET(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await canUseCapability(session.user.role, "notifications", session.user.id))) return NextResponse.json({ error: "Your role cannot access message delivery." }, { status: 403 });
  // Customer reminders and reconciliation records contain owner-only financial data.
  // Staff messaging remains available through the independently authorized inbox.
  if (session.user.role !== "OWNER") return NextResponse.json({ messages: [], paymentReviews: [], counts: { queued: 0, sent: 0, failed: 0 }, jobRuns: [], automation: null, jobHealthFresh: false });
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const [messages, queued, sent, failed, jobRuns] = await Promise.all([
    prisma.customerNotification.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.customerNotification.count({ where: { ...scope, status: { in: ["QUEUED", "PROCESSING"] } } }),
    prisma.customerNotification.count({ where: { ...scope, status: "SENT" } }),
    prisma.customerNotification.count({ where: { ...scope, status: "FAILED" } }),
    prisma.scheduledJobRun.findMany({ where: { jobName: "COLLECTIONS_DAILY" }, orderBy: { startedAt: "desc" }, take: 5, select: { id: true, status: true, updatedPlans: true, queuedReminders: true, queuedDigests: true, sentCount: true, failedCount: true, errorMessage: true, startedAt: true, finishedAt: true } }),
  ]);
  const paymentReviews = await prisma.paymentRequest.findMany({
    where: { status: "REVIEW", ...(session.user.role === "OWNER" ? {} : { OR: [{ creditPlan: { branchId: session.user.branchId ?? "" } }, { sale: { branchId: session.user.branchId ?? "" } }] }) },
    select: {
      id: true, amount: true, receivedAmount: true, mpesaReceipt: true, createdAt: true,
      creditPlan: { select: { customer: { select: { name: true } }, product: { select: { name: true } }, branch: { select: { name: true } } } },
      sale: { select: { invoiceNumber: true, branch: { select: { name: true } }, customer: { select: { name: true } }, saleItems: { select: { product: { select: { name: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const email = await getCompanyEmailSettings();
  const automation = session.user.role === "OWNER" ? {
    schedule: "07:30 Africa/Nairobi",
    cronSecretConfigured: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 32),
    publicHttpsUrl: Boolean((process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").startsWith("https://")),
    providers: {
      email: email.configured,
      sms: Boolean(process.env.AT_USERNAME && process.env.AT_API_KEY),
      whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_PAYMENT_TEMPLATE),
      mpesaStk: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY && process.env.MPESA_CALLBACK_SECRET),
      mpesaC2b: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_C2B_CALLBACK_SECRET),
    },
  } : null;
  const visibleJobRuns = session.user.role === "OWNER" ? jobRuns : jobRuns.map(({ id, status, startedAt, finishedAt, errorMessage }) => ({ id, status, startedAt, finishedAt, errorMessage }));
  const latestRun = jobRuns[0];
  const jobHealthFresh = Boolean(latestRun?.finishedAt && latestRun.status === "SUCCEEDED" && Date.now() - latestRun.finishedAt.getTime() < 36 * 60 * 60 * 1000);
  return NextResponse.json({ messages, paymentReviews, counts: { queued, sent, failed }, jobRuns: visibleJobRuns, automation, jobHealthFresh });
}

export async function GET(request: Request) { return notificationApi(() => handleGET(request), request); }
