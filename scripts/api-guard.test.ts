import assert from "node:assert/strict";
import test from "node:test";

import { apiErrorMessage, isJsonParseError, looksLikeHtml, parseApiBody, protectResponse } from "../src/lib/api-guard";

test("HTML error pages are never reported as a JSON parse failure", () => {
  assert.equal(looksLikeHtml("<html> <h1>502 Bad Gateway</h1>"), true);
  assert.throws(
    () => parseApiBody('<html> <h1>502 Bad Gateway</h1>', 502),
    (error: unknown) => error instanceof Error && error.message === apiErrorMessage(502) && !error.message.includes("Unexpected token"),
  );
});

test("broken JSON uses a plain status message instead of Unexpected token", () => {
  assert.throws(
    () => parseApiBody("not-json {", 500),
    (error: unknown) => error instanceof Error && error.message === "Something went wrong. Wait a few seconds and try again.",
  );
});

test("API JSON errors still surface the server error text", async () => {
  const response = protectResponse(new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "Content-Type": "application/json" } }));
  const body = await response.json() as { error: string };
  assert.equal(body.error, "Authentication required");
});

test("HTML Response.json() throws a human message, not Unexpected token", async () => {
  const response = protectResponse(new Response("<html> <h1>Unavailable</h1>", { status: 502, headers: { "Content-Type": "text/html" } }));
  await assert.rejects(
    () => response.json(),
    (error: unknown) => error instanceof Error && error.message === apiErrorMessage(502) && !/Unexpected token|not valid JSON/i.test(error.message),
  );
});

test("isJsonParseError matches the browser message the staff saw", () => {
  assert.equal(isJsonParseError(new SyntaxError("Unexpected token '<', \"<html> <h\"... is not valid JSON")), true);
});
