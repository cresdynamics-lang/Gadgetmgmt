import { requirePage } from "@/lib/require-page";
import { readStoredGrant } from "@/lib/entitlements";
import { canManageBusinessSettings } from "@/lib/access";
import { AccountSecurity } from "./account-security";
import { BusinessSettings } from "./business-settings";
import { PwaSettings } from "@/components/pwa-lifecycle";
import { DeviceCatalogAdmin } from "@/components/device-catalog-admin";
import { PwaReadiness } from "@/components/pwa-readiness";
export const instant = false;
export default async function SettingsPage() {
  const session=await requirePage("/settings");
  const grant=await readStoredGrant(session.user.role,session.user.id);
  return <div className="mx-auto max-w-4xl space-y-8"><div><h2 className="text-2xl font-semibold">Settings</h2><p className="security-detail">Manage your sign-in, devices and app preferences.</p></div><section id="account-security" aria-labelledby="account-security-title" className="scroll-mt-6"><AccountSecurity /></section><section className="security-stack" aria-labelledby="app-preferences-title"><h2 id="app-preferences-title" className="text-xl font-semibold">App preferences</h2><PwaSettings /><PwaReadiness /></section>{canManageBusinessSettings(session.user.role,grant)&&<BusinessSettings />}{session.user.role==="OWNER"&&<DeviceCatalogAdmin/>}</div>;
}
