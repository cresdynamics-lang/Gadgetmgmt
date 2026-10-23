import assert from "node:assert/strict";
import test from "node:test";

import { canAccessPage, hasPermission, needsApproval, resolvePermissions } from "../src/lib/access";

test("full grants add to the role and restricted grants stay locked until unlocked", () => {
  const grants = [{ permission: "reports.view", mode: "FULL" as const }, { permission: "finance.view", mode: "RESTRICTED" as const }];
  const locked = { role: "CASHIER", ...resolvePermissions("CASHIER", grants, []) };
  assert.equal(hasPermission(locked, "reports.view"), true);
  assert.equal(hasPermission(locked, "finance.view"), false);
  assert.equal(needsApproval(locked, "finance.view"), true);

  const unlocked = { role: "CASHIER", ...resolvePermissions("CASHIER", grants, ["finance.view"]) };
  assert.equal(hasPermission(unlocked, "finance.view"), true);
  assert.equal(needsApproval(unlocked, "finance.view"), false);
});

test("cashiers cannot see sales figures, stock or finances by default", () => {
  const cashier = { role: "CASHIER", ...resolvePermissions("CASHIER", [], []) };
  assert.equal(hasPermission(cashier, "reports.view"), false);
  assert.equal(hasPermission(cashier, "inventory.view"), false);
  assert.equal(hasPermission(cashier, "finance.view"), false);
  assert.equal(canAccessPage(cashier, "/reports"), false);
});

test("a locked restricted page can still be opened so the user can request a code", () => {
  const user = { role: "CASHIER", ...resolvePermissions("CASHIER", [{ permission: "reports.view", mode: "RESTRICTED" }], []) };
  assert.equal(canAccessPage(user, "/reports"), true);
  assert.equal(hasPermission(user, "reports.view"), false);
});

test("unknown permission names are ignored", () => {
  const { permissions, restricted } = resolvePermissions("CASHIER", [{ permission: "everything", mode: "FULL" }], []);
  assert.equal(permissions.includes("everything"), false);
  assert.deepEqual(restricted, []);
});
