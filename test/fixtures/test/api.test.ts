import test from "node:test";
import assert from "node:assert/strict";

import { callApi } from "../src/api.js";

test("callApi fixture", () => {
  assert.equal(callApi(), "ok");
});
