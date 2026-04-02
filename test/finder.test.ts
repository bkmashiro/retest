import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { findAffectedTests } from "../src/finder.js";
import { buildImportGraph } from "../src/graph.js";

const fixturesRoot = path.resolve("test/fixtures");
const srcRoot = path.join(fixturesRoot, "src");
const testRoot = path.join(fixturesRoot, "test");

async function buildFixtureGraph() {
  return await buildImportGraph({
    cwd: fixturesRoot,
    srcDir: "src",
    testDir: "test",
  });
}

test("changed auth.ts affects auth/api/app tests", async () => {
  const graph = await buildFixtureGraph();
  const affected = findAffectedTests(graph, [path.join(srcRoot, "auth.ts")], testRoot);

  assert.deepEqual(
    affected.map((item) => path.basename(item.testFile)),
    ["api.test.ts", "app.test.ts", "auth.test.ts"],
  );
});

test("changed api.ts affects api/app tests but not auth.test.ts", async () => {
  const graph = await buildFixtureGraph();
  const affected = findAffectedTests(graph, [path.join(srcRoot, "api.ts")], testRoot);

  assert.deepEqual(
    affected.map((item) => path.basename(item.testFile)),
    ["api.test.ts", "app.test.ts"],
  );
});

test("changed unrelated file affects only its direct test", async () => {
  const graph = await buildFixtureGraph();
  const affected = findAffectedTests(graph, [path.join(srcRoot, "db.ts")], testRoot);

  assert.deepEqual(
    affected.map((item) => path.basename(item.testFile)),
    ["db.test.ts"],
  );
});

test("db.test.ts is not affected by auth.ts changes", async () => {
  const graph = await buildFixtureGraph();
  const affected = findAffectedTests(graph, [path.join(srcRoot, "auth.ts")], testRoot);

  assert.equal(
    affected.some((item) => path.basename(item.testFile) === "db.test.ts"),
    false,
  );
});
