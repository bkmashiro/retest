import test from "node:test";
import assert from "node:assert/strict";

import { startApp } from "../src/app.js";

test("startApp fixture", () => {
  assert.equal(startApp(), "ok");
});
