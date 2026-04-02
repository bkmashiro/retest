import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  extractRelativeImports,
  parseImportsFromFile,
  resolveImportPath,
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
