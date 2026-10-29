import assert from "node:assert/strict";
import test from "node:test";

import { parseWebsiteLiveSnapshot, websiteLiveStale } from "../src/lib/website-live";

test("an empty setting is a missing snapshot", () => {
  assert.equal(parseWebsiteLiveSnapshot(""), null);
  assert.equal(parseWebsiteLiveSnapshot("<html>"), null);
  assert.equal(websiteLiveStale(null), true);
});

test("a snapshot older than two minutes is stale", () => {
  const now = Date.parse("2026-10-29T08:00:00Z");
  assert.equal(websiteLiveStale({ updatedAt: "2026-10-29T07:57:59Z" }, now), true);
  assert.equal(websiteLiveStale({ updatedAt: "2026-10-29T07:58:01Z" }, now), false);
});
