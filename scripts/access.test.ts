import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertEntitlementFloors,
  applyPageFloors,
  buildAccessMap,
  canAccessPage,
  canAssignStaffRole,
  canUseCapability,
  defaultAccessMap,
  hasAnyQuery,
  hasSensitiveQuery,
  parseEntitlementUpdate,
  safeInternalPath,
} from "../src/lib/access";

const root = path.resolve(import.meta.dirname, "..");

test("keeps the original role entitlements as defaults", () => {
  const grants = defaultAccessMap();
  assert.deepEqual(grants.OWNER.pages, ["*"]);
  assert.deepEqual(grants.CASHIER.pages, ["/dashboard", "/sales", "/deliveries", "/devices", "/repairs", "/customers", "/credit", "/performance", "/assistant", "/notifications"]);
  assert.deepEqual(grants.CASHIER.capabilities, ["sales", "customers", "credit"]);
  assert.deepEqual(grants.INVENTORY_LEAD.pages, ["/dashboard", "/inventory", "/planner", "/devices", "/repairs", "/assistant", "/notifications"]);
  assert.equal(canAccessPage("CASHIER", "/finance"), false);
  assert.equal(canAccessPage("OWNER", "/finance"), true);
  assert.equal(canAccessPage("CASHIER", "/deliveries"), true);
  assert.equal(canAccessPage("INVENTORY_LEAD", "/planner"), true);
  assert.deepEqual(buildAccessMap([{ role: "CASHIER", pages: ["/dashboard", "/sales", "/customers", "/credit", "/notifications"], capabilities: ["sales", "customers", "credit"] }]).CASHIER.pages, grants.CASHIER.pages);
  assert.equal(grants.BRANCH_MANAGER.capabilities.includes("layaway"), true);
  assert.equal(grants.BRANCH_MANAGER.pages.includes("/layaway"), false);
  assert.equal(canAccessPage("CASHIER", "/staff"), false);
  assert.equal(canAccessPage("CASHIER", "/sales/receipts"), true);
  assert.equal(canAccessPage("INVENTORY_LEAD", "/inventory/receive"), true);
  assert.equal(canUseCapability("BRANCH_MANAGER", "layaway"), true);
  assert.equal(canAccessPage("BRANCH_MANAGER", "/layaway"), false);
  assert.equal(canAccessPage("OWNER", "/access"), true);
  assert.equal(canAccessPage("CASHIER", "/access"), false);
});

test("uses stored entitlements and still keeps role access with the owner", () => {
  const grants = buildAccessMap([{ role: "CASHIER", pages: ["/dashboard", "/inventory", "/notifications"], capabilities: ["inventory"] }]);
  assert.equal(canAccessPage("CASHIER", "/inventory", grants), true);
  assert.equal(canAccessPage("CASHIER", "/sales", grants), false);
  assert.equal(canUseCapability("CASHIER", "sales", grants), false);
  assert.equal(canAccessPage("CASHIER", "/access", grants), false);
  assert.equal(canAccessPage("CASHIER", "/access", { CASHIER: { pages: ["*"], capabilities: [] } }), false);
  assert.equal(canAccessPage("CASHIER", "/sales", { CASHIER: { pages: ["*"], capabilities: [] } }), false);
  assert.equal(canAccessPage("CASHIER", "/dashboard", { CASHIER: { pages: ["*", "/dashboard"], capabilities: [] } }), true);
  assert.equal(canAccessPage("CASHIER", "/insights", { CASHIER: { pages: ["/dashboard", "/insights"], capabilities: [] } }), false);
  assert.equal(canAccessPage("BRANCH_MANAGER", "/insights", { BRANCH_MANAGER: { pages: ["/insights"], capabilities: [] } }), true);
  assert.deepEqual(applyPageFloors("CASHIER", ["*"]), []);
  assert.deepEqual(buildAccessMap([{ role: "CASHIER", pages: ["*"], capabilities: ["sales"] }]).CASHIER.pages, []);
  assert.equal(canAccessPage("UNKNOWN", "/dashboard"), false);
});

test("rejects entitlement updates that widen owner-only access", () => {
  const baseline = defaultAccessMap();
  const ok = parseEntitlementUpdate({
    grants: Object.entries(baseline).map(([role, grant]) => ({ role, pages: [...grant.pages], capabilities: [...grant.capabilities] })),
  });
  assert.equal(ok.ok, true);

  const wildcard = parseEntitlementUpdate({
    grants: Object.entries(baseline).map(([role, grant]) => ({
      role,
      pages: role === "CASHIER" ? ["*"] : [...grant.pages],
      capabilities: [...grant.capabilities],
    })),
  });
  assert.equal(wildcard.ok, false);

  const insights = assertEntitlementFloors({
    ...baseline,
    CASHIER: { pages: ["/dashboard", "/insights"], capabilities: ["sales"] },
  });
  assert.equal(insights.ok, false);
  const finance = assertEntitlementFloors({
    ...baseline,
    CASHIER: { pages: ["/dashboard", "/finance"], capabilities: ["sales"] },
  });
  assert.equal(finance.ok, false);

  const unknown = parseEntitlementUpdate({
    grants: Object.entries(baseline).map(([role, grant]) => ({ role, pages: [...grant.pages, "/secret"], capabilities: [...grant.capabilities] })),
  });
  assert.equal(unknown.ok, false);
});

test("keeps staff role assignment from escalating", () => {
  assert.equal(canAssignStaffRole("OWNER", "OWNER"), true);
  assert.equal(canAssignStaffRole("BRANCH_MANAGER", "CASHIER"), true);
  assert.equal(canAssignStaffRole("BRANCH_MANAGER", "OWNER"), false);
  assert.equal(canAssignStaffRole("BRANCH_MANAGER", "BRANCH_MANAGER"), false);
  assert.equal(canAssignStaffRole("CASHIER", "OWNER"), false);
  assert.equal(canAssignStaffRole("CASHIER", "CASHIER"), true);
  assert.equal(canAssignStaffRole("INVENTORY_LEAD", "BRANCH_MANAGER"), false);
});

test("rejects passwords and user details in urls", () => {
  assert.equal(hasSensitiveQuery(new URLSearchParams("callbackUrl=/dashboard")), false);
  assert.equal(hasSensitiveQuery(new URLSearchParams("branchId=cm123")), false);
  assert.equal(hasSensitiveQuery(new URLSearchParams("customer=cm123")), true);
  assert.equal(hasSensitiveQuery(new URLSearchParams("account=cm123")), true);
  assert.equal(hasSensitiveQuery(new URLSearchParams("password=secret")), true);
  assert.equal(hasSensitiveQuery(new URLSearchParams("Email=person@example.com")), true);
  assert.equal(hasSensitiveQuery(new URLSearchParams("user_id=123")), true);
  assert.equal(hasSensitiveQuery(new URLSearchParams("imei=490154203237518")), true);
  assert.equal(hasSensitiveQuery(new URLSearchParams("serial=C02ABCDEF12")), true);
  assert.equal(hasAnyQuery("https://gadgethub.local/api/staff"), false);
  assert.equal(hasAnyQuery("https://gadgethub.local/api/staff?email=person@example.com"), true);
  assert.equal(safeInternalPath("/dashboard"), "/dashboard");
  assert.equal(safeInternalPath("/customers/cm123"), "/customers/cm123");
  assert.equal(safeInternalPath("https://evil.example/dashboard"), null);
  assert.equal(safeInternalPath("//evil.example"), null);
  assert.equal(safeInternalPath("/\\evil.example"), null);
  assert.equal(safeInternalPath("/dashboard?password=secret"), null);
  assert.equal(safeInternalPath("/%2f%2fevil.example"), null);
});

test("each editable page is refused on the server when it is not granted", () => {
  const pages = ["/dashboard", "/sales", "/deliveries", "/inventory", "/planner", "/devices", "/repairs", "/partners", "/customers", "/credit", "/layaway", "/finance", "/expenses", "/performance", "/assistant", "/insights", "/staff", "/activity", "/notifications", "/settings", "/access"];
  for (const page of pages) {
    const layout = readFileSync(path.join(root, "src/app", page.slice(1), "layout.tsx"), "utf8");
    assert.match(layout, new RegExp(`requirePage\\("${page}"\\)`));
    assert.match(layout, /export const instant = false/);
  }
  const dashboard = readFileSync(path.join(root, "src/app/dashboard/page.tsx"), "utf8");
  assert.match(dashboard, /await requirePage\("\/dashboard"\)/);
});

test("server capability checks await the stored entitlement", () => {
  const files = walk(path.join(root, "src/app/api"));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      if (!line.includes("canUseCapability(")) continue;
      if (line.includes("await canUseCapability(")) continue;
      assert.fail(`${file} checks a capability without waiting for the stored entitlement: ${line.trim()}`);
    }
  }
});

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) return walk(fullPath);
    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}
