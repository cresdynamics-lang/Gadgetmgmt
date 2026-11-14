import assert from "node:assert/strict";
import test from "node:test";
import { authOrigin, pinDigest, codeDigest, digest, emailCode, opaqueToken, permittedOwner } from "../src/lib/auth-security";
import { hasSensitiveQuery, safeInternalPath, applyPageFloors, canManageBusinessSettings, canAccessPage, normalizeCapabilities, normalizePages } from "../src/lib/access";

test("verification code hashes bind the code to its challenge and server secret", () => {
  const original = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-server-secret";
  try {
    assert.notEqual(codeDigest("challenge-a", "123456"), codeDigest("challenge-b", "123456"));
    assert.notEqual(codeDigest("challenge-a", "123456"), digest("123456"));
    const before = codeDigest("challenge-a", "123456");
    process.env.NEXTAUTH_SECRET = "different-secret";
    assert.notEqual(codeDigest("challenge-a", "123456"), before);
  } finally { if (original === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = original; }
});

test("only the configured identity can authenticate with owner privileges", () => {
  const before = process.env.AUTH_OWNER_EMAIL;
  const initial = process.env.INITIAL_OWNER_EMAIL;
  try {
    delete process.env.AUTH_OWNER_EMAIL; delete process.env.INITIAL_OWNER_EMAIL;
    assert.equal(permittedOwner({ role: "OWNER", email: "administrator@example.test" }), false);
    process.env.AUTH_OWNER_EMAIL = "administrator@example.test";
    assert.equal(permittedOwner({ role: "OWNER", email: "ADMINISTRATOR@example.test" }), true);
    assert.equal(permittedOwner({ role: "OWNER", email: "other@example.test" }), false);
    assert.equal(permittedOwner({ role: "CASHIER", email: "staff@example.test" }), true);
  } finally {
    if (before === undefined) delete process.env.AUTH_OWNER_EMAIL; else process.env.AUTH_OWNER_EMAIL = before;
    if (initial === undefined) delete process.env.INITIAL_OWNER_EMAIL; else process.env.INITIAL_OWNER_EMAIL = initial;
  }
});

test("WebAuthn uses the configured HTTPS origin instead of request headers", () => {
  const before = process.env.APP_BASE_URL;
  try {
    process.env.APP_BASE_URL = "https://shop.example.test/path";
    assert.deepEqual(authOrigin(), { origin: "https://shop.example.test", rpID: "shop.example.test" });
    process.env.APP_BASE_URL = "http://shop.example.test";
    assert.throws(authOrigin, /HTTPS/);
    process.env.APP_BASE_URL = "http://localhost:3012";
    assert.deepEqual(authOrigin(), { origin: "http://localhost:3012", rpID: "localhost" });
  } finally { if (before === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = before; }
});

test("staff with no grants retain account security but cannot open an operational screen", () => {
  const grants = { CASHIER: { pages: [], capabilities: [] } };
  assert.equal(canAccessPage("CASHIER", "/account", grants), true);
  assert.equal(canAccessPage("CASHIER", "/settings", grants), true);
  assert.equal(canAccessPage("unknown", "/settings", grants), false);
  assert.equal(canAccessPage("CASHIER", "/sales", grants), false);
  assert.equal(canAccessPage("CASHIER", "/dashboard", grants), false);
  assert.equal(canAccessPage("unknown", "/account", grants), false);
});

test("individual grants never include owner finance or unrecognized capabilities", () => {
  assert.deepEqual(applyPageFloors("CASHIER", normalizePages(["/finance", "/expenses", "/activity", "/sales"])), ["/sales"]);
  assert.deepEqual(normalizeCapabilities(["sales", "companyEmailSettings", "payroll", "anything"]), ["sales"]);
});

test("device secrets have sufficient entropy and email codes retain leading zeroes", () => {
  const tokens = new Set(Array.from({ length: 100 }, opaqueToken));
  assert.equal(tokens.size, 100);
  for (const token of tokens) assert.equal(Buffer.from(token, "base64url").length, 32);
  for (let i = 0; i < 100; i++) assert.match(emailCode(), /^\d{6}$/);
});

test("personal settings access does not grant business configuration",()=>{
 assert.equal(canManageBusinessSettings("CASHIER",{pages:["/settings"],capabilities:["branchSettings"]}),false);
 assert.equal(canManageBusinessSettings("BRANCH_MANAGER",{pages:[],capabilities:["branchSettings"]}),false);
 assert.equal(canManageBusinessSettings("BRANCH_MANAGER",{pages:["/settings"],capabilities:[]}),false);
 assert.equal(canManageBusinessSettings("BRANCH_MANAGER",{pages:["/settings"],capabilities:["branchSettings"]}),true);
 assert.equal(canManageBusinessSettings("OWNER",{pages:[],capabilities:[]}),true);
});

test("app PIN digests bind a PIN to its user, device and server-held secret",()=>{
 const before=process.env.NEXTAUTH_SECRET;process.env.NEXTAUTH_SECRET="pin-review-secret";
 try{const value=pinDigest("user-a","device-a","004269");assert.notEqual(value,"004269");assert.notEqual(value,pinDigest("user-a","device-b","004269"));assert.notEqual(value,pinDigest("user-b","device-a","004269"));process.env.NEXTAUTH_SECRET="different-secret";assert.notEqual(value,pinDigest("user-a","device-a","004269"));}finally{if(before===undefined)delete process.env.NEXTAUTH_SECRET;else process.env.NEXTAUTH_SECRET=before;}
});

test("app PINs cannot be forwarded in callback URLs",()=>{
 assert.equal(hasSensitiveQuery(new URLSearchParams("pin=004269")),true);
 assert.equal(hasSensitiveQuery(new URLSearchParams("confirmPin=004269")),true);
 assert.equal(safeInternalPath("/settings?app_pin=004269"),null);
});
