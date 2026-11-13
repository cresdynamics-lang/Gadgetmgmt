import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  buildAccessMap,
  canAccessPage as allowPage,
  canUseCapability as allowCapability,
  isAppRole,
  normalizePages,
  normalizeCapabilities,
  applyPageFloors,
  type AccessCapability,
  type RoleGrant,
} from "@/lib/access";

function missingEntitlementStore(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code: unknown }).code);
  return code === "P2021" || code === "P2022";
}

export const getAccessMap = cache(async () => {
  try {
    const rows = await prisma.roleEntitlement.findMany({
      select: { role: true, pages: true, capabilities: true },
    });
    return buildAccessMap(rows);
  } catch (error) {
    if (missingEntitlementStore(error)) {
      console.error("Role entitlement table is not ready. Built-in access defaults are in use.");
      return buildAccessMap([]);
    }
    console.error("Role entitlements could not be loaded. Page and capability access is denied until the store can be read.");
    throw new Error("Role entitlements could not be loaded.");
  }
});

// Staff access is explicit per person; shared role grants never authorize staff.
export async function readStoredGrant(role: string, userId: string): Promise<RoleGrant> {
  if (!isAppRole(role)) return { pages: [], capabilities: [] };
  if (role === "OWNER") return { pages: ["*"], capabilities: ["sales", "inventory", "customers", "credit", "layaway", "staff", "branchSettings", "notifications"] };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accessPages: true, accessCapabilities: true } });
  return { pages: applyPageFloors(role, normalizePages(user?.accessPages ?? [])), capabilities: normalizeCapabilities(user?.accessCapabilities ?? []) };
}

export async function canAccessPage(role: string, pathname: string, userId: string) {
  const grant = await readStoredGrant(role, userId);
  return allowPage(role, pathname, isAppRole(role) ? { [role]: grant } : {});
}

export async function canUseCapability(role: string, capability: AccessCapability, userId: string) {
  const grant = await readStoredGrant(role, userId);
  return allowCapability(role, capability, isAppRole(role) ? { [role]: grant } : {});
}
