#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { findAffectedTests } from "./finder.js";
import { formatReport } from "./formatter.js";
import { buildImportGraph, walkCodeFiles } from "./graph.js";
import { runTests } from "./runner.js";

const execFileAsync = promisify(execFile);
const DEFAULT_RUNNER = "node --import tsx/esm --test";

interface CliOptions {
  changed?: string;
  gitDiff?: boolean;
  run?: boolean;
  runner: string;
  cwd: string;
  json?: boolean;
  testDir: string;
  srcDir: string;
}

async function getChangedFiles(options: CliOptions): Promise<string[]> {
  if (options.changed) {
    return [path.resolve(options.cwd, options.changed)];
  }

  if (!options.gitDiff) {
    throw new Error("Either --changed <file> or --git-diff is required.");
  }

  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", "HEAD"], {
      cwd: options.cwd,
    });

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((file) => path.resolve(options.cwd, file));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read changed files from git diff: ${message}`);
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("retest")
    .description("Find tests affected by changed source files using static import graph analysis.")
    .option("--changed <file>", "Source file that changed")
    .option("--git-diff", "Auto-detect changed files from `git diff --name-only HEAD`")
    .option("--run", "Actually run the affected tests")
    .option("--runner <cmd>", "Custom test runner command", DEFAULT_RUNNER)
    .option("--cwd <path>", "Project directory", process.cwd())
    .option("--json", "JSON output (list of affected test files)")
    .option("--test-dir <dir>", "Where tests live", "test")
    .option("--src-dir <dir>", "Where source lives", "src");

  program.parse(process.argv);
  const options = program.opts<CliOptions>();
  options.cwd = path.resolve(options.cwd);

  if (!options.changed && !options.gitDiff) {
    program.error("Either --changed <file> or --git-diff is required.");
  }

  const changedFiles = await getChangedFiles(options);
  const graph = await buildImportGraph({
    cwd: options.cwd,
    srcDir: options.srcDir,
    testDir: options.testDir,
  });
  const testRoot = path.resolve(options.cwd, options.testDir);
  const allTests = await walkCodeFiles(testRoot);
  const affected = findAffectedTests(graph, changedFiles, testRoot);
  const affectedPaths = new Set(affected.map((item) => item.testFile));
  const unaffected = allTests.filter((testFile) => !affectedPaths.has(testFile));

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(affected.map((item) => path.relative(options.cwd, item.testFile)), null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      `${formatReport({
        changedFiles,
        affected,
        unaffected,
        cwd: options.cwd,
        runner: options.runner,
        totalTests: allTests.length,
      })}\n`,
    );
  }

  if (options.run) {
    const code = await runTests(
      options.runner,
      affected.map((item) => path.relative(options.cwd, item.testFile)),
      options.cwd,
    );
    process.exitCode = code;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
