import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  buildAccessMap,
  canAccessPage as allowPage,
  canUseCapability as allowCapability,
  isAppRole,
  isOwnerEntitlementPath,
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

export async function readStoredGrant(role: string): Promise<RoleGrant> {
  if (!isAppRole(role)) return { pages: [], capabilities: [] };
  try {
    const grants = await getAccessMap();
    return grants[role] ?? { pages: [], capabilities: [] };
  } catch {
    return { pages: [], capabilities: [] };
  }
}

export async function canAccessPage(role: string, pathname: string) {
  try {
    return allowPage(role, pathname, await getAccessMap());
  } catch {
    return role === "OWNER" && isOwnerEntitlementPath(pathname);
  }
}

export async function canUseCapability(role: string, capability: AccessCapability) {
  try {
    return allowCapability(role, capability, await getAccessMap());
  } catch {
    return false;
  }
}
