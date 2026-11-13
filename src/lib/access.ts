export const ROLE_IDS = ["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"] as const;

export type AppRole = (typeof ROLE_IDS)[number];

export const ROLE_CATALOG: readonly { id: AppRole; label: string; detail: string }[] = [
  { id: "OWNER", label: "Owner", detail: "Gadgethub owner" },
  { id: "BRANCH_MANAGER", label: "Branch manager", detail: "Runs one branch" },
  { id: "CASHIER", label: "Cashier", detail: "Sells and collects" },
  { id: "INVENTORY_LEAD", label: "Inventory lead", detail: "Looks after stock" },
];

export const PAGE_CATALOG = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/sales", label: "Sales (POS)" },
  { path: "/deliveries", label: "Deliveries" },
  { path: "/inventory", label: "Inventory" },
  { path: "/planner", label: "Stock planner" },
  { path: "/devices", label: "Devices" },
  { path: "/trade-ins", label: "Trade-ins & returns" },
  { path: "/repairs", label: "Repairs" },
  { path: "/partners", label: "Partners" },
  { path: "/customers", label: "Customers" },
  { path: "/credit", label: "Lipa Mdogo Mdogo" },
  { path: "/layaway", label: "Layaway close-out" },
  { path: "/finance", label: "Finance" },
  { path: "/expenses", label: "Expenses" },
  { path: "/performance", label: "Performance" },
  { path: "/assistant", label: "AI Assistant" },
  { path: "/insights", label: "Business insights" },
  { path: "/staff", label: "Staff & users" },
  { path: "/activity", label: "Activity" },
  { path: "/notifications", label: "Messages & alerts" },
  { path: "/settings", label: "Settings" },
] as const;

const OWNER_ONLY_PAGES = new Set(["/finance", "/expenses", "/activity"]);

const legacyRolePages = {
  BRANCH_MANAGER: ["/dashboard", "/sales", "/inventory", "/customers", "/credit", "/staff", "/insights", "/settings", "/notifications"],
  CASHIER: ["/dashboard", "/sales", "/customers", "/credit", "/notifications"],
  INVENTORY_LEAD: ["/dashboard", "/inventory", "/notifications"],
} as const;

export type AccessPage = (typeof PAGE_CATALOG)[number]["path"];

export const CAPABILITY_CATALOG = [
  { id: "repairs", label: "Repairs", detail: "Assign repairs and record return inspections" },
  { id: "deliveries", label: "Deliveries", detail: "Record handovers, proof and customer payments" },
  { id: "partners", label: "Partners", detail: "Record device loans, returns and settlements" },
  { id: "tradeIns", label: "Trade-ins & returns", detail: "Inspect and receive devices; valuations stay with the owner" },
  { id: "costEntry", label: "Write-only costs", detail: "Record device costs without reading protected financial values" },
  { id: "sales", label: "Sales", detail: "View and record sales" },
  { id: "inventory", label: "Inventory", detail: "View stock. Creating products still follows the existing role rules." },
  { id: "customers", label: "Customers", detail: "View and create customer accounts" },
  { id: "credit", label: "Credit", detail: "Lipa accounts and payments" },
  { id: "layaway", label: "Layaway", detail: "Layaway payments and fulfillment" },
  { id: "staff", label: "Staff", detail: "View staff. Only an owner can assign the owner or branch manager role." },
  { id: "branchSettings", label: "Branch settings", detail: "Update a branch profile when the role is also allowed to." },
  { id: "notifications", label: "Notifications", detail: "Message delivery and alerts" },
] as const;

export type AccessCapability = (typeof CAPABILITY_CATALOG)[number]["id"] | "companyEmailSettings";

export type RoleGrant = {
  pages: string[];
  capabilities: AccessCapability[];
};

export type AccessMap = Partial<Record<AppRole, RoleGrant>>;

const PAGE_PATHS = new Set<string>(PAGE_CATALOG.map((page) => page.path));
const CAPABILITY_IDS = new Set<string>(CAPABILITY_CATALOG.map((capability) => capability.id));

export const defaultRoleGrants: Record<AppRole, { pages: readonly string[]; capabilities: readonly AccessCapability[] }> = {
  OWNER: {
    pages: ["*"],
    capabilities: CAPABILITY_CATALOG.map((capability) => capability.id),
  },
  BRANCH_MANAGER: {
    pages: ["/dashboard", "/sales", "/deliveries", "/inventory", "/planner", "/devices", "/repairs", "/partners", "/customers", "/credit", "/performance", "/assistant", "/staff", "/insights", "/settings", "/notifications"],
    capabilities: ["sales", "inventory", "customers", "credit", "layaway", "staff", "branchSettings", "notifications"],
  },
  CASHIER: {
    pages: ["/dashboard", "/sales", "/deliveries", "/devices", "/repairs", "/customers", "/credit", "/performance", "/assistant", "/notifications"],
    capabilities: ["sales", "customers", "credit"],
  },
  INVENTORY_LEAD: {
    pages: ["/dashboard", "/inventory", "/planner", "/devices", "/repairs", "/assistant", "/notifications"],
    capabilities: ["inventory"],
  },
};

const SENSITIVE_QUERY_KEYS = new Set([
  "password",
  "pass",
  "passwd",
  "pwd",
  "newpassword",
  "confirmpassword",
  "currentpassword",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "api_key",
  "apikey",
  "email",
  "e-mail",
  "username",
  "user",
  "name",
  "phone",
  "userid",
  "user_id",
  "userdetails",
  "customer",
  "customerid",
  "customer_id",
  "account",
  "accountid",
  "account_id",
  "session",
  "imei",
  "imei1",
  "imei2",
  "serial",
  "serialnumber",
  "serial_number",
]);

export function isAppRole(role: string): role is AppRole {
  return (ROLE_IDS as readonly string[]).includes(role);
}

export function defaultAccessMap(): Record<AppRole, RoleGrant> {
  return {
    OWNER: { pages: [...defaultRoleGrants.OWNER.pages], capabilities: [...defaultRoleGrants.OWNER.capabilities] },
    BRANCH_MANAGER: { pages: [...defaultRoleGrants.BRANCH_MANAGER.pages], capabilities: [...defaultRoleGrants.BRANCH_MANAGER.capabilities] },
    CASHIER: { pages: [...defaultRoleGrants.CASHIER.pages], capabilities: [...defaultRoleGrants.CASHIER.capabilities] },
    INVENTORY_LEAD: { pages: [...defaultRoleGrants.INVENTORY_LEAD.pages], capabilities: [...defaultRoleGrants.INVENTORY_LEAD.capabilities] },
  };
}

export function normalizePages(values: readonly string[]) {
  if (values.includes("*")) return ["*"];
  return PAGE_CATALOG.map((page) => page.path).filter((path) => values.includes(path));
}

export function normalizeCapabilities(values: readonly string[]): AccessCapability[] {
  return CAPABILITY_CATALOG.map((capability) => capability.id).filter((id) => values.includes(id));
}

function samePageSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((page, index) => page === sortedRight[index]);
}

export function applyPageFloors(role: AppRole, pages: readonly string[]) {
  if (role === "OWNER") return [...pages];
  return pages.filter((page) => page !== "*" && !OWNER_ONLY_PAGES.has(page) && (role === "BRANCH_MANAGER" || page !== "/insights"));
}

export function buildAccessMap(rows: readonly { role: string; pages: readonly string[]; capabilities: readonly string[] }[]) {
  const map = defaultAccessMap();
  for (const row of rows) {
    if (!isAppRole(row.role)) continue;
    const normalized = normalizePages(row.pages);
    const legacy = row.role === "OWNER" ? null : legacyRolePages[row.role];
    const pages = legacy && !normalized.includes("*") && samePageSet(normalized, legacy) ? [...defaultRoleGrants[row.role].pages] : normalized;
    map[row.role] = {
      pages: applyPageFloors(row.role, pages),
      capabilities: normalizeCapabilities(row.capabilities),
    };
  }
  return map;
}

export function isOwnerEntitlementPath(pathname: string) {
  return pathname === "/access" || pathname.startsWith("/access/");
}

export function canAccessPage(role: string, pathname: string, grants?: AccessMap) {
  if (pathname === "/") return isAppRole(role);
  if (pathname === "/account" || pathname.startsWith("/account/")) return isAppRole(role);
  if (isOwnerEntitlementPath(pathname)) return role === "OWNER";
  const stored = grants && isAppRole(role) ? grants[role]?.pages : undefined;
  const raw = stored ?? (isAppRole(role) ? defaultRoleGrants[role].pages : []);
  const pages = isAppRole(role) ? applyPageFloors(role, raw) : [];
  return pages.includes("*") || pages.some((page) => page !== "*" && (pathname === page || pathname.startsWith(`${page}/`)));
}

export function canUseCapability(role: string, capability: AccessCapability, grants?: AccessMap) {
  if (capability === "companyEmailSettings") return role === "OWNER";
  const stored = grants && isAppRole(role) ? grants[role]?.capabilities : undefined;
  const capabilities = stored ?? (isAppRole(role) ? defaultRoleGrants[role].capabilities : []);
  return capabilities.includes(capability);
}

export function sessionGrants(role: string, pages: readonly string[] | undefined, capabilities: readonly string[] | undefined): AccessMap | undefined {
  if (!pages || !capabilities || !isAppRole(role)) return undefined;
  return { [role]: { pages: normalizePages(pages), capabilities: normalizeCapabilities(capabilities) } };
}

export function canAssignStaffRole(actorRole: string, targetRole: string) {
  if (!isAppRole(targetRole)) return false;
  if (actorRole === "OWNER") return true;
  return targetRole === "CASHIER" || targetRole === "INVENTORY_LEAD";
}

export function isSensitiveQueryKey(key: string) {
  return SENSITIVE_QUERY_KEYS.has(key.trim().toLowerCase().replace(/[[\]]/g, ""));
}

export function hasSensitiveQuery(params: URLSearchParams) {
  for (const key of params.keys()) {
    if (isSensitiveQueryKey(key)) return true;
  }
  return false;
}

export function hasAnyQuery(url: string) {
  try {
    return [...new URL(url).searchParams.keys()].length > 0;
  } catch {
    return false;
  }
}

export function safeInternalPath(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("://") || decoded.includes("@") || decoded.includes("\0")) return null;
  const withoutHash = decoded.split("#")[0] ?? "";
  const [pathPart, queryPart] = withoutHash.split("?");
  if (queryPart) {
    if (hasSensitiveQuery(new URLSearchParams(queryPart)) || queryPart.length > 0) return null;
  }
  if (!pathPart || !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(pathPart)) return null;
  return pathPart;
}

/**
 * Public origin for auth redirects. Prefer forwarded host headers from the
 * Cloudflare tunnel. Never use a loopback NEXTAUTH_URL that Auth.js may have
 * written onto nextUrl.
 */
export function publicRequestOrigin(request: { headers: Headers; nextUrl: URL }) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || hostHeader || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (request.nextUrl.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

export function publicAppUrl(request: { headers: Headers; nextUrl: URL }, path: string) {
  return new URL(path, publicRequestOrigin(request)).toString();
}

export function parseEntitlementUpdate(input: unknown): { ok: true; grants: Record<AppRole, RoleGrant> } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Send the role entitlements in the request body." };
  const grantsValue = (input as { grants?: unknown }).grants;
  if (!Array.isArray(grantsValue) || grantsValue.length !== ROLE_IDS.length) return { ok: false, error: "Include one entitlement for each role." };

  const seen = new Set<AppRole>();
  const grants = defaultAccessMap();
  for (const entry of grantsValue) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Each role entitlement must be an object." };
    const role = (entry as { role?: unknown }).role;
    const pages = (entry as { pages?: unknown }).pages;
    const capabilities = (entry as { capabilities?: unknown }).capabilities;
    if (typeof role !== "string" || !isAppRole(role) || seen.has(role)) return { ok: false, error: "Each role must be included once." };
    if (!Array.isArray(pages) || !Array.isArray(capabilities)) return { ok: false, error: "Choose pages and capabilities from the access list." };
    if (pages.length > PAGE_CATALOG.length + 1 || capabilities.length > CAPABILITY_CATALOG.length) return { ok: false, error: "Choose pages and capabilities from the access list." };
    if (pages.some((page) => typeof page !== "string" || page.length > 80) || capabilities.some((capability) => typeof capability !== "string" || capability.length > 40)) {
      return { ok: false, error: "Choose pages and capabilities from the access list." };
    }
    const pageValues = pages as string[];
    const capabilityValues = capabilities as string[];
    if (pageValues.some((page) => page !== "*" && !PAGE_PATHS.has(page)) || (pageValues.includes("*") && pageValues.some((page) => page !== "*"))) {
      return { ok: false, error: "Choose pages from the access list." };
    }
    if (capabilityValues.some((capability) => !CAPABILITY_IDS.has(capability))) return { ok: false, error: "Choose capabilities from the access list." };
    seen.add(role);
    grants[role] = {
      pages: pageValues.includes("*") ? ["*"] : normalizePages(pageValues),
      capabilities: normalizeCapabilities(capabilityValues),
    };
  }

  if (seen.size !== ROLE_IDS.length) return { ok: false, error: "Include one entitlement for each role." };
  return assertEntitlementFloors(grants);
}

export function assertEntitlementFloors(grants: Record<AppRole, RoleGrant>): { ok: true; grants: Record<AppRole, RoleGrant> } | { ok: false; error: string } {
  for (const role of ROLE_IDS) {
    if (role !== "OWNER" && grants[role].pages.includes("*")) {
      return { ok: false, error: "Only the Gadgethub owner can have access to every page." };
    }
    if (role !== "OWNER" && role !== "BRANCH_MANAGER" && grants[role].pages.includes("/insights")) {
      return { ok: false, error: "Business insights can be granted only to the owner and branch managers." };
    }
    if (role !== "OWNER" && grants[role].pages.some((page) => OWNER_ONLY_PAGES.has(page))) {
      return { ok: false, error: "Finance, expenses, and the activity log stay with the owner." };
    }
  }
  return { ok: true, grants };
}
