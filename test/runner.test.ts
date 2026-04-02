import test from "node:test";
import assert from "node:assert/strict";

import { runTests } from "../src/runner.js";

test("runTests returns zero without spawning when there are no test files", async () => {
  assert.equal(await runTests("node --test", [], process.cwd()), 0);
});

test("runTests passes shell-quoted file names through to the runner", async () => {
  const script =
    "const files = process.argv.slice(1); process.exit(files.includes(\"space name.test.ts\") && files.includes(\"quote's.test.ts\") ? 0 : 1);";
  const exitCode = await runTests(`node -e ${JSON.stringify(script)}`, [
    "space name.test.ts",
    "quote's.test.ts",
  ], process.cwd());

  assert.equal(exitCode, 0);
});
