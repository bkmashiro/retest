import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { formatReport } from "../src/formatter.js";

const cwd = path.resolve("test/fixtures");

test("formatReport renders empty affected and unaffected sections", () => {
  const report = formatReport({
    changedFiles: [path.join(cwd, "src", "auth.ts")],
    affected: [],
    unaffected: [],
    cwd,
    runner: "node --test",
    totalTests: 0,
  });

  assert.match(report, /Changed:\n  src\/auth\.ts/);
  assert.match(report, /Affected tests \(via import graph\):\n  \(none\)/);
  assert.match(report, /Unaffected \(skipping\):\n  \(none\)/);
  assert.match(report, /Run: node --test/);
});

test("formatReport describes direct and indirect dependency chains", () => {
  const report = formatReport({
    changedFiles: [path.join(cwd, "src", "auth.ts")],
    affected: [
      {
        testFile: path.join(cwd, "test", "auth.test.ts"),
        changedFile: path.join(cwd, "src", "auth.ts"),
        chain: [
          path.join(cwd, "test", "auth.test.ts"),
          path.join(cwd, "src", "auth.ts"),
        ],
      },
      {
        testFile: path.join(cwd, "test", "app.test.ts"),
        changedFile: path.join(cwd, "src", "auth.ts"),
        chain: [
          path.join(cwd, "test", "app.test.ts"),
          path.join(cwd, "src", "app.ts"),
          path.join(cwd, "src", "api.ts"),
          path.join(cwd, "src", "auth.ts"),
        ],
      },
    ],
    unaffected: [path.join(cwd, "test", "db.test.ts")],
    cwd,
    runner: "node --test",
    totalTests: 3,
  });

  assert.match(report, /auth\.test\.ts\s+direct import/);
  assert.match(report, /app\.test\.ts\s+indirect: app\.ts -> api\.ts -> auth\.ts \(2 hops\)/);
  assert.match(report, /test\/db\.test\.ts/);
  assert.match(report, /\(2 of 3 test files\)/);
});
