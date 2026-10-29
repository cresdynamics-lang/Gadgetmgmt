import assert from "node:assert/strict";
import test from "node:test";

import { kenyaDateTime } from "../src/lib/kenya-time";

test("stores UTC instants as Kenya wall-clock time with seconds", () => {
  const stamp = kenyaDateTime("2026-10-29T08:12:04.000Z");
  assert.match(stamp, /29 Oct 2026/);
  assert.match(stamp, /11:12:04/);
  assert.match(stamp, /EAT$/);
});
