import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { isPermission, permissionLabels, type Permission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { APPROVAL_WINDOW_MS, hashApprovalCode } from "@/lib/authz";
import { emailConfigured, sendEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ permission: z.string().refine(isPermission) }).strict();

/** Restricted grants for the signed-in user, with the time each one stays unlocked. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const [grants, approvals] = await Promise.all([
    prisma.userPermission.findMany({ where: { userId: session.user.id, mode: "RESTRICTED" }, select: { permission: true } }),
    prisma.permissionApproval.findMany({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
      select: { permission: true, expiresAt: true, verifiedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    restricted: grants.filter((grant) => isPermission(grant.permission)).map((grant) => {
      const active = approvals.find((approval) => approval.permission === grant.permission && approval.verifiedAt);
      const pending = approvals.find((approval) => approval.permission === grant.permission && !approval.verifiedAt);
      return {
        permission: grant.permission,
        label: permissionLabels[grant.permission as Permission],
        unlockedUntil: active?.expiresAt ?? null,
        codePendingUntil: pending?.expiresAt ?? null,
      };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Email a one-time 6-digit code to every active super admin. The code works for 5 minutes. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid permission." }, { status: 400 });
  const permission = parsed.data.permission as Permission;

  const grant = await prisma.userPermission.findUnique({ where: { userId_permission: { userId: session.user.id, permission } }, select: { mode: true } });
  if (grant?.mode !== "RESTRICTED") return NextResponse.json({ error: "This permission does not need an approval code for your account." }, { status: 400 });

  const now = new Date();
  const recent = await prisma.permissionApproval.findFirst({
    where: { userId: session.user.id, permission, verifiedAt: null, createdAt: { gt: new Date(now.getTime() - 60_000) } },
    select: { id: true },
  });
  if (recent) return NextResponse.json({ error: "A code was just sent. Wait a minute before requesting another one." }, { status: 429 });

  const admins = await prisma.user.findMany({ where: { role: "OWNER", status: "ACTIVE" }, select: { email: true } });
  if (!admins.length) return NextResponse.json({ error: "No active super admin is available to approve this request." }, { status: 503 });
  const mailReady = emailConfigured("accounts");
  if (!mailReady && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Email is not configured, so an approval code cannot be sent to the super admin." }, { status: 503 });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + APPROVAL_WINDOW_MS);
  // A new code replaces any earlier unused one for the same permission.
  await prisma.permissionApproval.deleteMany({ where: { userId: session.user.id, permission, verifiedAt: null } });
  const approval = await prisma.permissionApproval.create({
    data: { userId: session.user.id, permission, codeHash: hashApprovalCode(session.user.id, permission, code), expiresAt },
    select: { id: true },
  });

  const label = permissionLabels[permission];
  const requester = session.user.name ?? session.user.email ?? "A staff member";
  const time = now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
  const subject = `Approval code ${code} · ${requester} wants to ${label.toLowerCase()}`;
  const text = `${requester} (${session.user.email ?? "no email"}) requested access to "${label}" at ${time}. Share this code with them only if you approve: ${code}. It expires in 5 minutes.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:ui-sans-serif,system-ui,sans-serif;color:#111111">
    <div style="max-width:520px;margin:24px auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;padding:28px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6b6b">GadgetHub · Approval request</p>
      <h1 style="margin:0 0 12px;font-size:20px">${requester} wants to ${label.toLowerCase()}</h1>
      <p style="margin:0 0 18px;line-height:1.55;color:#3d3d3d">Requested at ${time}. Share this code with them only if you approve. It expires in 5 minutes.</p>
      <p style="margin:0;font-size:34px;font-weight:700;letter-spacing:.3em">${code}</p>
    </div></body></html>`;

  if (mailReady) {
    const results = await Promise.allSettled(admins.map((admin) => sendEmail({ to: admin.email, subject, text, html, category: "accounts" })));
    if (results.every((result) => result.status === "rejected")) {
      await prisma.permissionApproval.delete({ where: { id: approval.id } });
      console.error("Approval code email failed", results.map((result) => result.status === "rejected" && result.reason instanceof Error ? result.reason.message : "unknown"));
      return NextResponse.json({ error: "The approval code could not be emailed. Try again shortly." }, { status: 502 });
    }
  } else {
    console.warn(`[approval] Email is not configured. Development approval code for ${requester} · ${label}: ${code}`);
  }

  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "APPROVAL_REQUESTED",
    summary: `Requested an approval code to ${label.toLowerCase()}`,
    entityType: "PermissionApproval",
    entityId: approval.id,
  });
  return NextResponse.json({
    expiresAt,
    message: mailReady
      ? "A 6-digit code was emailed to the super admin. Ask them to share it with you."
      : "Email is not configured in this development setup. The code was written to the server log.",
  }, { status: 201 });
}
