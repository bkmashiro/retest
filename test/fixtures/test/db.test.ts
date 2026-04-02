import test from "node:test";
import assert from "node:assert/strict";

import { connectDb } from "../src/db.js";

test("connectDb fixture", () => {
  assert.equal(connectDb(), "db");
});
