import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildReverseGraph, findAffectedTests, isTestFile } from "../src/finder.js";
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

test("isTestFile only matches files nested under the test root", () => {
  assert.equal(isTestFile(testRoot, testRoot), false);
  assert.equal(isTestFile(path.join(testRoot, "auth.test.ts"), testRoot), true);
  assert.equal(isTestFile(path.join(fixturesRoot, "src", "auth.ts"), testRoot), false);
});

test("buildReverseGraph preserves files with no importers and links importers", async () => {
  const graph = await buildFixtureGraph();
  const reverse = buildReverseGraph(graph);

  assert.deepEqual([...reverse.get(path.join(srcRoot, "auth.ts")) ?? []].sort(), [
    path.join(srcRoot, "api.ts"),
    path.join(testRoot, "auth.test.ts"),
  ]);
  assert.deepEqual([...reverse.get(path.join(testRoot, "app.test.ts")) ?? []], []);
});

test("changed files outside the graph do not affect any tests", async () => {
  const graph = await buildFixtureGraph();
  const affected = findAffectedTests(graph, [path.join(fixturesRoot, "src", "missing.ts")], testRoot);

  assert.deepEqual(affected, []);
});

test("findAffectedTests keeps the shortest chain when multiple changed files reach the same test", async () => {
  const authFile = path.join(srcRoot, "auth.ts");
  const apiFile = path.join(srcRoot, "api.ts");
  const appFile = path.join(srcRoot, "app.ts");
  const appTestFile = path.join(testRoot, "app.test.ts");
  const graph = new Map([
    [authFile, new Set()],
    [apiFile, new Set([authFile])],
    [appFile, new Set([apiFile])],
    [appTestFile, new Set([appFile])],
  ]);

  const affected = findAffectedTests(graph, [authFile, apiFile], testRoot);
  const appTest = affected.find((item) => item.testFile === appTestFile);

  assert.ok(appTest);
  assert.equal(appTest.changedFile, apiFile);
  assert.deepEqual(appTest.chain, [appTestFile, appFile, apiFile]);
});
