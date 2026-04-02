import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { findAffectedTests } from "../src/finder.js";
import { buildImportGraph, walkCodeFiles } from "../src/graph.js";
import {
  analyzeImpact,
  calculateImpactScore,
  collectTransitiveImporters,
  formatImpactReport,
  getImpactSeverity,
} from "../src/impact.js";

const fixturesRoot = path.resolve("test/fixtures");
const srcRoot = path.join(fixturesRoot, "src");
const testRoot = path.join(fixturesRoot, "test");

async function buildFixtureInputs() {
  const graph = await buildImportGraph({
    cwd: fixturesRoot,
    srcDir: "src",
    testDir: "test",
  });
  const allTests = await walkCodeFiles(testRoot);

  return { graph, allTests };
}

test("calculateImpactScore applies weighted test and fan-in components", () => {
  assert.equal(calculateImpactScore(3, 4, 2, 4), 63);
  assert.equal(getImpactSeverity(63), "MEDIUM");
  assert.equal(getImpactSeverity(80), "HIGH");
  assert.equal(getImpactSeverity(10), "LOW");
});

test("collectTransitiveImporters walks all reachable importers", () => {
  const authFile = path.join(srcRoot, "auth.ts");
  const apiFile = path.join(srcRoot, "api.ts");
  const appFile = path.join(srcRoot, "app.ts");
  const authTestFile = path.join(testRoot, "auth.test.ts");
  const apiTestFile = path.join(testRoot, "api.test.ts");
  const appTestFile = path.join(testRoot, "app.test.ts");
  const graph = new Map([
    [authFile, new Set()],
    [apiFile, new Set([authFile])],
    [appFile, new Set([apiFile])],
    [authTestFile, new Set([authFile])],
    [apiTestFile, new Set([apiFile])],
    [appTestFile, new Set([appFile])],
  ]);

  assert.deepEqual([...collectTransitiveImporters(graph, authFile)].sort(), [
    apiFile,
    appFile,
    apiTestFile,
    appTestFile,
    authTestFile,
  ]);
});

test("analyzeImpact reports score, fan-in, and affected test cases for a changed file", async () => {
  const { graph, allTests } = await buildFixtureInputs();
  const changedFile = path.join(srcRoot, "auth.ts");
  const affected = findAffectedTests(graph, [changedFile], testRoot);
  const analysis = await analyzeImpact(graph, changedFile, affected, allTests, srcRoot);

  assert.equal(analysis.sourceFanIn, 1);
  assert.equal(analysis.directImporterCount, 2);
  assert.equal(analysis.transitiveImporterCount, 3);
  assert.equal(analysis.totalAffectedTestCases, 3);
  assert.equal(analysis.totalTestCases, 4);
  assert.equal(analysis.impactScore, 50);
  assert.equal(analysis.severity, "MEDIUM");
  assert.deepEqual(
    analysis.affectedTests.map((item) => [path.basename(item.testFile), item.hopCount, item.testCases]),
    [
      ["api.test.ts", 1, 1],
      ["app.test.ts", 2, 1],
      ["auth.test.ts", 0, 1],
    ],
  );
});

test("formatImpactReport renders the impact analysis summary", async () => {
  const { graph, allTests } = await buildFixtureInputs();
  const changedFile = path.join(srcRoot, "auth.ts");
  const affected = findAffectedTests(graph, [changedFile], testRoot);
  const analysis = await analyzeImpact(graph, changedFile, affected, allTests, srcRoot);
  const report = formatImpactReport(analysis, fixturesRoot);

  assert.match(report, /Impact analysis for src\/auth\.ts:/);
  assert.match(report, /Impact score: 50\/100 \(MEDIUM\)/);
  assert.match(report, /1 source file directly import/);
  assert.match(report, /3 additional files depend on it transitively/);
  assert.match(report, /test\/auth\.test\.ts/);
  assert.match(report, /Total: 3 test cases to run/);
});
