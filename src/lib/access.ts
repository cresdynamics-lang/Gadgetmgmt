export type AccessCapability = "sales" | "inventory" | "customers" | "credit" | "layaway" | "staff" | "branchSettings" | "notifications" | "activity" | "reports";

export type Permission =
  | "dashboard.view"
  | "sales.view"
  | "sales.create"
  | "sales.adjust"
  | "inventory.view"
  | "inventory.receive"
  | "products.price"
  | "customers.view"
  | "customers.manage"
  | "credit.view"
  | "credit.collect"
  | "credit.policy"
  | "staff.view"
  | "staff.manage"
  | "permissions.manage"
  | "reports.view"
  | "finance.view"
  | "goals.manage"
  | "insights.view"
  | "assistant.use"
  | "settings.view"
  | "notifications.view"
  | "activity.view"
  | "scope.allBranches";

export type PermissionGrantMode = "FULL" | "RESTRICTED";

/**
 * Who is asking. A bare role string uses that role's defaults. A signed-in user carries
 * `permissions` (role defaults + full grants + restricted grants unlocked with a live code)
 * and `restricted` (restricted grants that still need an approval code).
 */
export type AccessSubject = string | { role: string; permissions?: readonly string[] | null; restricted?: readonly string[] | null } | null | undefined;

export const permissionLabels: Record<Permission, string> = {
  "dashboard.view": "View dashboard",
  "sales.view": "View POS",
  "sales.create": "Record sales",
  "sales.adjust": "Adjust checkout totals",
  "inventory.view": "View stock",
  "inventory.receive": "Receive stock",
  "products.price": "Edit product prices",
  "customers.view": "View customers",
  "customers.manage": "Manage customers",
  "credit.view": "View Lipa accounts",
  "credit.collect": "Record Lipa payments",
  "credit.policy": "Edit Lipa policy",
  "staff.view": "View staff",
  "staff.manage": "Manage staff accounts",
  "permissions.manage": "Grant user permissions",
  "reports.view": "View sales reports",
  "finance.view": "View financial position",
  "goals.manage": "Set sales goals",
  "insights.view": "View business insights",
  "assistant.use": "Use AI assistant",
  "settings.view": "View settings",
  "notifications.view": "View messages",
  "activity.view": "View activity log",
  "scope.allBranches": "See every branch",
};

export const allPermissions = Object.keys(permissionLabels) as Permission[];

/** Permissions the super admin keeps to themselves and never delegates. */
export const ownerOnlyPermissions: readonly Permission[] = ["permissions.manage", "scope.allBranches"];

const rolePermissions: Record<string, readonly Permission[]> = {
  OWNER: allPermissions,
  BRANCH_MANAGER: [
    "dashboard.view", "sales.view", "sales.create",
    "inventory.view", "inventory.receive", "products.price", "customers.view", "customers.manage",
    "credit.view", "credit.collect", "credit.policy", "staff.view", "staff.manage",
    "settings.view", "notifications.view",
  ],
  CASHIER: [
    "dashboard.view", "sales.view", "sales.create",
    "customers.view", "customers.manage", "credit.view", "credit.collect",
  ],
  INVENTORY_LEAD: [
    "dashboard.view", "inventory.view", "inventory.receive",
  ],
};

const pagePermission: Record<string, Permission> = {
  "/dashboard": "dashboard.view",
  "/sales": "sales.view",
  "/reports": "reports.view",
  "/inventory": "inventory.view",
  "/customers": "customers.view",
  "/credit": "credit.view",
  "/staff": "staff.view",
  "/insights": "insights.view",
  "/notifications": "notifications.view",
  "/settings": "settings.view",
  "/activity": "activity.view",
};

export const capabilityPermission: Record<AccessCapability, Permission> = {
  sales: "sales.view",
  inventory: "inventory.view",
  customers: "customers.view",
  credit: "credit.view",
  layaway: "credit.view",
  staff: "staff.view",
  branchSettings: "settings.view",
  notifications: "notifications.view",
  activity: "activity.view",
  reports: "reports.view",
};

export function isPermission(value: string): value is Permission {
  return value in permissionLabels;
}

export function permissionsForRole(role: string): readonly Permission[] {
  return rolePermissions[role] ?? [];
}

function subjectRole(subject: AccessSubject) {
  if (!subject) return "";
  return typeof subject === "string" ? subject : subject.role;
}

export function effectivePermissions(subject: AccessSubject): readonly string[] {
  if (!subject) return [];
  if (typeof subject !== "string" && Array.isArray(subject.permissions)) return subject.permissions;
  return permissionsForRole(subjectRole(subject));
}

/** Combine role defaults with per-user grants. Restricted grants count only while unlocked. */
export function resolvePermissions(role: string, grants: { permission: string; mode: PermissionGrantMode }[], unlocked: readonly string[]) {
  const permissions = new Set<string>(permissionsForRole(role));
  const restricted = new Set<string>();
  for (const grant of grants) {
    if (!isPermission(grant.permission) || permissions.has(grant.permission)) continue;
    if (grant.mode === "FULL") permissions.add(grant.permission);
    else if (unlocked.includes(grant.permission)) permissions.add(grant.permission);
    else restricted.add(grant.permission);
  }
  return { permissions: [...permissions], restricted: [...restricted] };
}

export function hasPermission(subject: AccessSubject, permission: Permission) {
  return effectivePermissions(subject).includes(permission);
}

/** True when the user holds this permission only as a restricted grant that is currently locked. */
export function needsApproval(subject: AccessSubject, permission: Permission) {
  return Boolean(subject && typeof subject !== "string" && subject.restricted?.includes(permission));
}

function pagePermissionFor(pathname: string) {
  const match = Object.keys(pagePermission)
    .sort((left, right) => right.length - left.length)
    .find((page) => pathname === page || pathname.startsWith(`${page}/`));
  return match ? pagePermission[match] : null;
}

/** Pages open for restricted grants too, so the user can request an approval code there. */
export function canAccessPage(subject: AccessSubject, pathname: string) {
  const permission = pagePermissionFor(pathname);
  return permission ? hasPermission(subject, permission) || needsApproval(subject, permission) : false;
}

export function canUseCapability(subject: AccessSubject, capability: AccessCapability) {
  return hasPermission(subject, capabilityPermission[capability]);
}

export function canSeeAllBranches(subject: AccessSubject) {
  return hasPermission(subject, "scope.allBranches");
}

export const roleNames: Record<string, string> = {
  OWNER: "Super admin",
  BRANCH_MANAGER: "Branch manager",
  CASHIER: "Cashier",
  INVENTORY_LEAD: "Inventory lead",
};
