import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildImportGraph,
  extractRelativeImports,
  parseImportsFromFile,
  resolveImportPath,
  walkCodeFiles,
} from "../src/graph.js";

const fixturesRoot = path.resolve("test/fixtures");

test("extractRelativeImports parses relative imports", () => {
  const source = `
    import { login } from './auth.js';
    export { start } from "./app.js";
    import './side-effect.js';
  `;

  assert.deepEqual(extractRelativeImports(source), [
    "./auth.js",
    "./app.js",
    "./side-effect.js",
  ]);
});

test("extractRelativeImports ignores non-relative imports", () => {
  const source = `
    import React from 'react';
    export { something } from "@scope/pkg";
  `;

  assert.deepEqual(extractRelativeImports(source), []);
});

test("resolveImportPath resolves relative imports to absolute files", async () => {
  const fromFile = path.join(fixturesRoot, "src", "api.ts");
  const resolved = await resolveImportPath(fromFile, "./auth.js");

  assert.equal(resolved, path.join(fixturesRoot, "src", "auth.ts"));
});

test("parseImportsFromFile returns resolved imports", async () => {
  const filePath = path.join(fixturesRoot, "test", "api.test.ts");
  const imports = await parseImportsFromFile(filePath);

  assert.deepEqual([...imports], [path.join(fixturesRoot, "src", "api.ts")]);
});

test("walkCodeFiles returns an empty list for missing or non-directory roots", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "retest-graph-"));
  const filePath = path.join(tempDir, "file.ts");
  await writeFile(filePath, "export const value = 1;\n", "utf8");

  assert.deepEqual(await walkCodeFiles(path.join(tempDir, "missing")), []);
  assert.deepEqual(await walkCodeFiles(filePath), []);
});

test("walkCodeFiles includes nested ts/js files in sorted order", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "retest-graph-"));
  const nestedDir = path.join(tempDir, "nested");
  await mkdir(nestedDir);
  await writeFile(path.join(tempDir, "b.ts"), "export {};\n", "utf8");
  await writeFile(path.join(nestedDir, "a.js"), "export {};\n", "utf8");
  await writeFile(path.join(nestedDir, "ignore.txt"), "ignore\n", "utf8");

  assert.deepEqual(await walkCodeFiles(tempDir), [
    path.join(tempDir, "b.ts"),
    path.join(nestedDir, "a.js"),
  ]);
});

test("resolveImportPath returns null when no matching file exists", async () => {
  const fromFile = path.join(fixturesRoot, "src", "api.ts");
  const resolved = await resolveImportPath(fromFile, "./missing.js");

  assert.equal(resolved, null);
});

test("buildImportGraph includes src and test files keyed by absolute path", async () => {
  const graph = await buildImportGraph({
    cwd: fixturesRoot,
    srcDir: "src",
    testDir: "test",
  });

  assert.equal(graph.has(path.join(fixturesRoot, "src", "auth.ts")), true);
  assert.equal(graph.has(path.join(fixturesRoot, "test", "auth.test.ts")), true);
});
