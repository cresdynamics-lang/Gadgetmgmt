import assert from "node:assert/strict";
import test from "node:test";

import { customerEmailHtml, mailCategoryForKind } from "../src/lib/mail";

test("each email kind goes out through its own Resend key", () => {
  assert.equal(mailCategoryForKind("SALE_RECEIPT"), "orders");
  assert.equal(mailCategoryForKind("SALE_PAYMENT_LINKS"), "orders");
  assert.equal(mailCategoryForKind("STAFF_WELCOME"), "accounts");
  assert.equal(mailCategoryForKind("CREDIT_REMINDER"), "notifications");
  assert.equal(mailCategoryForKind(null), "notifications");
});

test("customer names cannot inject markup into emails", () => {
  const html = customerEmailHtml({ heading: "Receipt", intro: "Hello <script>alert(1)</script>" });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
});
