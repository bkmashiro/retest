import { spawn } from "node:child_process";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
interface SummaryValue {
  covered: number;
  total: number;
  pct: number;
}

interface FileCoverageLike {
  toSummary(): {
    lines: SummaryValue;
    branches: SummaryValue;
  };
  getLineCoverage(): Record<string, number>;
}

const createC8Report = require("c8").Report as (options: Record<string, unknown>) => {
  getCoverageMapFromAllCoverageFiles(): Promise<{
    files(): string[];
    fileCoverageFor(file: string): FileCoverageLike;
  }>;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function runTests(
  runner: string,
  testFiles: string[],
  cwd: string,
): Promise<number> {
  return await spawnRunner(runner, testFiles, cwd);
}

export interface CoverageMetric {
  covered: number;
  total: number;
  pct: number;
}

export interface FileCoverageSummary {
  filePath: string;
  lines: CoverageMetric;
  branches: CoverageMetric;
  uncoveredLines: number[];
}

export interface CoverageRunResult {
  exitCode: number;
  summaries: FileCoverageSummary[];
}

export async function runTestsWithCoverage(
  runner: string,
  testFiles: string[],
  cwd: string,
  changedFiles: string[],
): Promise<CoverageRunResult> {
  if (testFiles.length === 0) {
    return { exitCode: 0, summaries: [] };
  }

  const tempDirectory = await mkdtemp(path.join(tmpdir(), "retest-coverage-"));
  try {
    const exitCode = await spawnRunner(runner, testFiles, cwd, {
      NODE_V8_COVERAGE: tempDirectory,
    });
    await waitForCoverageFiles(tempDirectory);
    const summaries = await collectCoverageSummaries(cwd, tempDirectory, changedFiles);
    return { exitCode, summaries };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export function formatCoverageSummary(summary: FileCoverageSummary, cwd: string): string {
  const relPath = path.relative(cwd, summary.filePath) || ".";
  const uncovered = formatLineRanges(summary.uncoveredLines);

  return [
    `Coverage for ${relPath}:`,
    `  Lines:    ${summary.lines.pct.toFixed(1)}% (${summary.lines.covered}/${summary.lines.total})`,
    `  Branches: ${summary.branches.pct.toFixed(1)}% (${summary.branches.covered}/${summary.branches.total})`,
    `  Uncovered: ${uncovered || "none"}`,
  ].join("\n");
}

async function spawnRunner(
  runner: string,
  testFiles: string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<number> {
  if (testFiles.length === 0) {
    return 0;
  }

  const command = `${runner} ${testFiles.map(shellQuote).join(" ")}`;

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      shell: true,
      stdio: "inherit",
    });
    let exitCode = 1;

    child.on("error", reject);
    child.on("exit", (code) => {
      exitCode = code ?? 1;
    });
    child.on("close", () => resolve(exitCode));
  });
}

async function collectCoverageSummaries(
  cwd: string,
  tempDirectory: string,
  changedFiles: string[],
): Promise<FileCoverageSummary[]> {
  const report = createC8Report({
    reporter: ["text"],
    reportsDirectory: path.join(tempDirectory, "reports"),
    tempDirectory,
    src: [cwd],
    all: false,
    exclude: [],
    extension: [".js", ".cjs", ".mjs", ".ts", ".cts", ".mts"],
    excludeAfterRemap: true,
    skipFull: false,
    allowExternal: true,
    excludeNodeModules: false,
  });
  const coverageMap = await report.getCoverageMapFromAllCoverageFiles();
  const fileAliases = await Promise.all(
    changedFiles.map(async (filePath) => ({
      original: filePath,
      aliases: await getCoverageAliases(filePath),
    })),
  );

  return fileAliases
    .map(({ original, aliases }) => {
      const match = coverageMap
        .files()
        .find((candidate) => aliases.has(candidate));
      if (!match) {
        return null;
      }

      const fileCoverage = coverageMap.fileCoverageFor(match);
      return summarizeFileCoverage(fileCoverage, original);
    })
    .filter((summary): summary is FileCoverageSummary => summary !== null);
}

function summarizeFileCoverage(
  fileCoverage: FileCoverageLike,
  filePath: string,
): FileCoverageSummary {
  const summary = fileCoverage.toSummary();
  const lineCoverage = fileCoverage.getLineCoverage();
  const uncoveredLines = Object.entries(lineCoverage)
    .filter(([, hits]) => hits === 0)
    .map(([line]) => Number(line))
    .sort((a, b) => a - b);

  return {
    filePath,
    lines: {
      covered: summary.lines.covered,
      total: summary.lines.total,
      pct: summary.lines.pct,
    },
    branches: {
      covered: summary.branches.covered,
      total: summary.branches.total,
      pct: summary.branches.pct,
    },
    uncoveredLines,
  };
}

async function getCoverageAliases(filePath: string): Promise<Set<string>> {
  const aliases = new Set<string>();
  const resolved = path.resolve(filePath);
  aliases.add(resolved);

  try {
    aliases.add(await realpath(resolved));
  } catch {
    // Ignore deleted or virtual paths and fall back to the resolved path.
  }

  return aliases;
}

async function waitForCoverageFiles(tempDirectory: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const entries = await readdir(tempDirectory);
    if (entries.some((entry) => entry.endsWith(".json"))) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function formatLineRanges(lines: number[]): string {
  if (lines.length === 0) {
    return "";
  }

  const ranges: string[] = [];
  let start = lines[0];
  let end = lines[0];

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === end + 1) {
      end = line;
      continue;
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = line;
    end = line;
  }

  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return `lines ${ranges.join(", ")}`;
}
