import assert from "node:assert/strict";
import test from "node:test";

import { stanbicSalesStatus } from "../src/lib/stanbic";

const filled = {
  STANBIC_CLIENT_ID: "id",
  STANBIC_CLIENT_SECRET: "secret",
  STANBIC_MERCHANT_CODE: "merchant",
  STANBIC_CALLBACK_URL: "https://development.gadgethubke.com/api/webhooks/stanbic",
  STANBIC_CALLBACK_SECRET: "callback-secret",
};

test("Stanbic stays disconnected until a verified callback exists", () => {
  const empty = stanbicSalesStatus({});
  assert.equal(empty.provider, "stanbic");
  assert.equal(empty.connected, false);
  assert.deepEqual(empty.missing, [
    "STANBIC_CLIENT_ID",
    "STANBIC_CLIENT_SECRET",
    "STANBIC_MERCHANT_CODE",
    "STANBIC_CALLBACK_URL",
    "STANBIC_CALLBACK_SECRET",
  ]);

  const readyLooking = stanbicSalesStatus(filled);
  assert.equal(readyLooking.connected, false);
  assert.deepEqual(readyLooking.missing, []);
  assert.match(readyLooking.detail, /callback/i);
  assert.equal(JSON.stringify(readyLooking).includes("secret"), false);
});
