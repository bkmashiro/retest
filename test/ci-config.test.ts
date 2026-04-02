import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatCiGenerationMessage,
  generateCiConfig,
  getCiConfig,
} from "../src/ci-config.js";

test("getCiConfig returns the github-actions workflow template", () => {
  const config = getCiConfig("github-actions");

  assert.match(config.content, /name: Smart Test/);
  assert.match(config.content, /pnpm exec retest --git-diff --run/);
});

test("generateCiConfig writes github actions workflow to disk", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "retest-ci-"));
  const generated = await generateCiConfig(cwd, "github-actions");
  const written = await readFile(generated.outputPath, "utf8");

  assert.equal(path.relative(cwd, generated.outputPath), path.join(".github", "workflows", "smart-test.yml"));
  assert.equal(written, generated.content);
  assert.match(formatCiGenerationMessage(generated, cwd), /Generated \.github\/workflows\/smart-test\.yml:/);
});

test("generateCiConfig writes gitlab config to disk", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "retest-ci-"));
  const generated = await generateCiConfig(cwd, "gitlab");
  const written = await readFile(generated.outputPath, "utf8");

  assert.equal(path.relative(cwd, generated.outputPath), ".gitlab-ci.yml");
  assert.equal(written, generated.content);
  assert.match(written, /smart-test:/);
  assert.match(formatCiGenerationMessage(generated, cwd), /Generated \.gitlab-ci\.yml smart test stage:/);
});
