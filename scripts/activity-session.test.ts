import assert from "node:assert/strict";
import test from "node:test";

import { SESSION_STALE_MS, sessionPresence } from "../src/lib/activity";

const now = Date.parse("2026-10-29T08:00:00.000Z");

test("a session with endedAt is signed out even if last seen is recent", () => {
  assert.equal(sessionPresence("2026-10-29T07:59:00.000Z", "2026-10-29T07:59:50.000Z", now), "signed-out");
});

test("a session still heartbeating is live", () => {
  assert.equal(sessionPresence(null, "2026-10-29T07:59:00.000Z", now), "live");
});

test("closing the tab without logout shows as left once the heartbeat goes stale", () => {
  assert.equal(sessionPresence(null, new Date(now - SESSION_STALE_MS - 1).toISOString(), now), "left");
  assert.equal(sessionPresence(null, new Date(now - SESSION_STALE_MS + 1000).toISOString(), now), "live");
});
