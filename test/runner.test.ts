import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { formatCoverageSummary, runTests } from "../src/runner.js";

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

test("formatCoverageSummary renders percentages and uncovered ranges", () => {
  const cwd = path.resolve("/tmp/retest");
  const output = formatCoverageSummary(
    {
      filePath: path.join(cwd, "src", "math.ts"),
      lines: { covered: 3, total: 5, pct: 60 },
      branches: { covered: 2, total: 3, pct: 66.66 },
      uncoveredLines: [3, 4, 8],
    },
    cwd,
  );

  assert.match(output, /Coverage for src\/math\.ts:/);
  assert.match(output, /Lines:\s+60\.0% \(3\/5\)/);
  assert.match(output, /Branches:\s+66\.7% \(2\/3\)/);
  assert.match(output, /Uncovered: lines 3-4, 8/);
});
