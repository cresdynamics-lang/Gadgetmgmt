import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  buildAccessMap,
  canAccessPage as allowPage,
  canUseCapability as allowCapability,
  isAppRole,
  type AccessCapability,
  type RoleGrant,
} from "@/lib/access";

export const getAccessMap = cache(async () => {
  try {
    const rows = await prisma.roleEntitlement.findMany({
      select: { role: true, pages: true, capabilities: true },
    });
    return buildAccessMap(rows);
  } catch {
    console.error("Role entitlements could not be loaded. Built-in access defaults are in use.");
    return buildAccessMap([]);
  }
});

export async function readStoredGrant(role: string): Promise<RoleGrant> {
  if (!isAppRole(role)) return { pages: [], capabilities: [] };
  const grants = await getAccessMap();
  return grants[role] ?? { pages: [], capabilities: [] };
}

export async function canAccessPage(role: string, pathname: string) {
  return allowPage(role, pathname, await getAccessMap());
}

export async function canUseCapability(role: string, capability: AccessCapability) {
  return allowCapability(role, capability, await getAccessMap());
}
