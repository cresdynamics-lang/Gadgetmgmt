import { canUseCapability } from "@/lib/access";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notificationApi } from "@/lib/notification-api";
import { sameOrigin } from "@/lib/staff-alerts";
import { emailSettingsInput } from "@/lib/email-settings-input";
import { getCompanyEmailSettings } from "@/lib/email-settings";

export async function GET() {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (!canUseCapability(session.user.role, "companyEmailSettings")) return Response.json({ error: "Only the company owner can configure email." }, { status: 403 });
    const settings = await getCompanyEmailSettings();
    return Response.json({ senderEmail: settings.senderEmail, senderName: settings.senderName, apiKeyConfigured: settings.apiKeyConfigured });
  });
}

export async function PUT(request: Request) {
  return notificationApi(async () => {
    const session = await auth();
    if (!session?.user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (!sameOrigin(request) || !canUseCapability(session.user.role, "companyEmailSettings")) return Response.json({ error: "Only the company owner can configure email." }, { status: 403 });
    const parsed = emailSettingsInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter a valid company sender email and sender name." }, { status: 400 });
    const data = { ...parsed.data, updatedById: session.user.id };
    await prisma.notificationEmailSettings.upsert({ where: { id: "company" }, create: { id: "company", ...data }, update: data });
    const settings = await getCompanyEmailSettings();
    return Response.json({ configured: settings.configured, apiKeyConfigured: settings.apiKeyConfigured });
  });
}
