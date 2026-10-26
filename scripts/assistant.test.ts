import assert from "node:assert/strict";
import test from "node:test";

import { resolvePermissions } from "../src/lib/access";
import { runTool, stripSecrets, toolsFor, type AssistantUser } from "../src/lib/assistant/tools";

const userWith = (role: string, grants: { permission: string; mode: "FULL" | "RESTRICTED" }[] = []): AssistantUser => ({ role, id: "u1", branchId: "b1", ...resolvePermissions(role, grants, []) });
const names = (user: AssistantUser) => toolsFor(user).map((tool) => tool.name).sort();

test("the super admin gets every tool, including direct database reads", () => {
  const owner = names(userWith("OWNER"));
  assert.ok(owner.includes("query_database"));
  assert.ok(owner.includes("money_received"));
  assert.ok(owner.includes("sales_summary"));
});

test("a cashier only gets tools for what their role can see", () => {
  const cashier = names(userWith("CASHIER"));
  assert.deepEqual(cashier, ["customer_details", "lipa_accounts"]);
});

test("granting a permission unlocks the matching tool, restricted grants stay locked", () => {
  assert.ok(names(userWith("CASHIER", [{ permission: "reports.view", mode: "FULL" }])).includes("sales_summary"));
  assert.ok(!names(userWith("CASHIER", [{ permission: "reports.view", mode: "RESTRICTED" }])).includes("sales_summary"));
});

test("a tool refuses to run for someone without its permission", async () => {
  const result = await runTool("money_received", { period: "this_week" }, userWith("CASHIER"), new Date());
  assert.deepEqual(result, { error: "This person does not have permission to see this information." });
});

test("secrets never leave a database read", () => {
  const cleaned = stripSecrets({ name: "A", passwordHash: "x", nested: [{ tokenHash: "y", codeHash: "z", portalTokenHash: "w", amount: 5 }] });
  assert.deepEqual(cleaned, { name: "A", nested: [{ amount: 5 }] });
});
