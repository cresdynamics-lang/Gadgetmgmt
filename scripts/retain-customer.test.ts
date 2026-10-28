import assert from "node:assert/strict";
import test from "node:test";

import {
  fallbackCustomerName,
  filledContact,
  hasTwoContacts,
  mergeCustomerFields,
  phoneKeys,
  selectCustomerMatch,
} from "../src/lib/retain-customer";

const stored = [
  { id: "a", name: "Jane Wanjiku", email: "jane@example.com", phone: "254712345678" },
  { id: "b", name: "Peter Otieno", email: null, phone: "0733000111" },
];

test("retains a lead when any two of name, email and phone are present", () => {
  assert.equal(hasTwoContacts({ name: "Jane Wanjiku", phone: "0712 345 678" }), true);
  assert.equal(hasTwoContacts({ email: "jane@example.com", phone: "0712345678" }), true);
  assert.equal(hasTwoContacts({ name: "Jane Wanjiku", email: "jane@example.com" }), true);
  assert.equal(hasTwoContacts({ name: "Jane" }), false);
  assert.equal(hasTwoContacts({ phone: "0712345678" }), false);
});

test("phone keys treat 07, 254 and +254 as the same number", () => {
  assert.deepEqual(new Set(phoneKeys("0712 345 678")), new Set(["712345678", "0712345678", "254712345678", "+254712345678"]));
  assert.ok(phoneKeys("0712345678").includes("254712345678"));
});

test("matches an existing customer by phone even when the name is new", () => {
  const hit = selectCustomerMatch({ name: "Jane W.", phone: "0712345678" }, stored);
  assert.equal(hit?.id, "a");
});

test("matches an existing customer by email when the phone is missing", () => {
  const hit = selectCustomerMatch({ name: "Jane Wanjiku", email: "jane@example.com" }, stored);
  assert.equal(hit?.id, "a");
});

test("does not invent a match from a shared first name", () => {
  const hit = selectCustomerMatch({ name: "Jane", email: "other@example.com" }, stored);
  assert.equal(hit, null);
});

test("updates blank email and keeps a longer name", () => {
  const merged = mergeCustomerFields(stored[1], { name: "Peter Otieno", email: "peter@gadgethubke.com", phone: "0733000111" });
  assert.equal(merged.changed, true);
  assert.equal(merged.next.email, "peter@gadgethubke.com");
  assert.equal(merged.next.phone, "254733000111");
});

test("does not wipe an existing email with a blank", () => {
  const merged = mergeCustomerFields(stored[0], { name: "Jane Wanjiku", phone: "0712345678" });
  assert.equal(merged.next.email, "jane@example.com");
});

test("falls back to the email local-part when the name is missing", () => {
  assert.equal(fallbackCustomerName({ email: "ada@gadgethubke.com", phone: "0712345678" }), "ada");
});

test("ignores a one-field or empty payload", () => {
  assert.deepEqual(filledContact({ name: "A" }), { name: "", email: "", phone: "" });
  assert.equal(hasTwoContacts({}), false);
});
