import test from "node:test";
import assert from "node:assert/strict";

import { login } from "../src/auth.js";

test("login fixture", () => {
  assert.equal(login(), "ok");
});
