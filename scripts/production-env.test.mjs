import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const base = {
  DATABASE_URL: "postgresql://app:secret@localhost:5432/app",
  POSTGRES_USER: "app", POSTGRES_PASSWORD: "secret", POSTGRES_DB: "app",
  NEXTAUTH_SECRET: "x".repeat(43), INITIAL_OWNER_EMAIL: "owner@example.com",
  INITIAL_OWNER_PASSWORD: "literal$VALUE#with\"quotes'and\\slashes",
  NEXTAUTH_URL: "https://development.gadgethubke.com",
  APP_BASE_URL: "https://development.gadgethubke.com",
};
function prepare(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "production-env-"));
  try {
    const file = join(dir, "runtime.env");
    const result = spawnSync(process.execPath, ["scripts/prepare-production-env.mjs", file], {
      env: { PATH: process.env.PATH, ...base, ...overrides }, encoding: "utf8",
    });
    return { ...result, contents: result.status === 0 ? readFileSync(file, "utf8") : "" };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test("preserves literal credentials without logging them or forwarding deployment keys", () => {
  const r = prepare({ DEPLOY_SSH_KEY: "private-deployment-key" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.contents.includes(`INITIAL_OWNER_PASSWORD=${base.INITIAL_OWNER_PASSWORD}\n`));
  assert.ok(!r.contents.includes("DEPLOY_SSH_KEY"));
  assert.ok(!r.stdout.includes(base.INITIAL_OWNER_PASSWORD));
});
test("rejects localhost callback URLs", () => {
  assert.notEqual(prepare({ APP_BASE_URL: "http://localhost:3001" }).status, 0);
});
test("rejects inconsistent or missing database password credentials", () => {
  assert.notEqual(prepare({ DATABASE_URL: "postgresql://app@localhost:5432/app" }).status, 0);
  assert.notEqual(prepare({ POSTGRES_PASSWORD: "different" }).status, 0);
  assert.notEqual(prepare({ POSTGRES_DB: "different" }).status, 0);
});
test("rejects newline injection into raw environment files", () => {
  assert.notEqual(prepare({ SMTP_PASS: "value\nNODE_OPTIONS=--inspect" }).status, 0);
});
