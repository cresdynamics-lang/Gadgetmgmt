export type AccessCapability = "sales" | "inventory" | "customers" | "credit" | "staff" | "branchSettings";

const roleAccess: Record<string, { pages: readonly string[]; capabilities: readonly AccessCapability[] }> = {
  OWNER: {
    pages: ["*"],
    capabilities: ["sales", "inventory", "customers", "credit", "staff", "branchSettings"],
  },
  BRANCH_MANAGER: {
    pages: ["/dashboard", "/sales", "/inventory", "/customers", "/credit", "/staff", "/reports", "/settings"],
    capabilities: ["sales", "inventory", "customers", "credit", "staff", "branchSettings"],
  },
  CASHIER: {
    pages: ["/dashboard", "/sales", "/customers", "/credit"],
    capabilities: ["sales", "customers", "credit"],
  },
  INVENTORY_LEAD: {
    pages: ["/dashboard", "/inventory"],
    capabilities: ["inventory"],
  },
};

export function canAccessPage(role: string, pathname: string) {
  const pages = roleAccess[role]?.pages ?? [];
  return pages.includes("*") || pages.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

export function canUseCapability(role: string, capability: AccessCapability) {
  return roleAccess[role]?.capabilities.includes(capability) ?? false;
}