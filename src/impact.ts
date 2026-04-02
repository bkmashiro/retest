import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AffectedTest } from "./finder.js";
import { buildReverseGraph } from "./finder.js";
import type { ImportGraph } from "./graph.js";

const TEST_CASE_RE = /\b(?:test|it)\s*\(/g;

export interface AffectedTestImpact extends AffectedTest {
  hopCount: number;
  testCases: number;
}

export interface ImpactAnalysis {
  changedFile: string;
  impactScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  directImporterCount: number;
  transitiveImporterCount: number;
  sourceFanIn: number;
  sourceFileRatio: number;
  affectedTests: AffectedTestImpact[];
  totalAffectedTestCases: number;
  totalTestCases: number;
  totalSourceFiles: number;
}

export function calculateImpactScore(
  affectedTestCases: number,
  totalTestCases: number,
  fanIn: number,
  totalFiles: number,
): number {
  const testWeight = totalTestCases === 0 ? 0 : (affectedTestCases / totalTestCases) * 50;
  const fanInWeight = totalFiles === 0 ? 0 : (fanIn / totalFiles) * 50;

  return Math.max(0, Math.min(100, Math.round(testWeight + fanInWeight)));
}

export function getImpactSeverity(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 67) {
    return "HIGH";
  }

  if (score >= 34) {
    return "MEDIUM";
  }

  return "LOW";
}

export async function countTestCases(filePath: string): Promise<number> {
  const source = await readFile(filePath, "utf8");
  const matches = source.match(TEST_CASE_RE);
  return matches?.length ?? 0;
}

export function collectTransitiveImporters(
  graph: ImportGraph,
  changedFile: string,
): Set<string> {
  const reverse = buildReverseGraph(graph);
  const resolvedChanged = path.resolve(changedFile);
  const visited = new Set<string>();
  const queue = [...(reverse.get(resolvedChanged) ?? [])];

  for (const importer of queue) {
    visited.add(importer);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const importer of reverse.get(current) ?? []) {
      if (visited.has(importer)) {
        continue;
      }

      visited.add(importer);
      queue.push(importer);
    }
  }

  return visited;
}

export async function analyzeImpact(
  graph: ImportGraph,
  changedFile: string,
  affected: AffectedTest[],
  allTestFiles: string[],
  srcRoot: string,
): Promise<ImpactAnalysis> {
  const reverse = buildReverseGraph(graph);
  const resolvedChanged = path.resolve(changedFile);
  const sourceFiles = [...graph.keys()].filter((filePath) => {
    const relative = path.relative(srcRoot, filePath);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  const directImporters = reverse.get(resolvedChanged) ?? new Set<string>();
  const sourceDirectImporters = [...directImporters].filter((filePath) => sourceFiles.includes(filePath));
  const transitiveImporters = collectTransitiveImporters(graph, resolvedChanged);
  const sourceFanIn = sourceDirectImporters.length;
  const sourceFileRatio = sourceFiles.length === 0 ? 0 : sourceFanIn / sourceFiles.length;

  const impactedTests = await Promise.all(
    affected
      .filter((item) => path.resolve(item.changedFile) === resolvedChanged)
      .map(async (item) => ({
        ...item,
        hopCount: Math.max(0, item.chain.length - 2),
        testCases: await countTestCases(item.testFile),
      })),
  );

  const totalAffectedTestCases = impactedTests.reduce((sum, item) => sum + item.testCases, 0);
  const totalCasesByFile = await Promise.all(allTestFiles.map((filePath) => countTestCases(filePath)));
  const totalTestCases = totalCasesByFile.reduce((sum, count) => sum + count, 0);
  const impactScore = calculateImpactScore(
    totalAffectedTestCases,
    totalTestCases,
    sourceFanIn,
    sourceFiles.length,
  );

  return {
    changedFile: resolvedChanged,
    impactScore,
    severity: getImpactSeverity(impactScore),
    directImporterCount: directImporters.size,
    transitiveImporterCount: Math.max(0, transitiveImporters.size - directImporters.size),
    sourceFanIn,
    sourceFileRatio,
    affectedTests: impactedTests.sort((a, b) => a.testFile.localeCompare(b.testFile)),
    totalAffectedTestCases,
    totalTestCases,
    totalSourceFiles: sourceFiles.length,
  };
}

export function formatImpactReport(analysis: ImpactAnalysis, cwd: string): string {
  const relativeChanged = path.relative(cwd, analysis.changedFile) || ".";
  const lines = [`Impact analysis for ${relativeChanged}:`, ""];
  const percentage = Math.round(analysis.sourceFileRatio * 100);

  lines.push(`Impact score: ${analysis.impactScore}/100 (${analysis.severity})`);
  lines.push(
    `  - ${analysis.affectedTests.length} test file${analysis.affectedTests.length === 1 ? "" : "s"} depend on this file`,
  );
  lines.push(
    `  - ${analysis.sourceFanIn} source file${analysis.sourceFanIn === 1 ? "" : "s"} directly import it`,
  );
  lines.push(
    `  - ${analysis.transitiveImporterCount} additional file${analysis.transitiveImporterCount === 1 ? "" : "s"} depend on it transitively`,
  );
  lines.push(
    `  - ${relativeChanged} is imported by ${percentage}% of source files (${analysis.sourceFanIn}/${analysis.totalSourceFiles})`,
  );
  lines.push("");
  lines.push(`Affected tests (${analysis.affectedTests.length}):`);

  if (analysis.affectedTests.length === 0) {
    lines.push("  (none)");
  } else {
    for (const item of analysis.affectedTests) {
      const relation =
        item.hopCount === 0 ? "direct" : `${item.hopCount} hop${item.hopCount === 1 ? "" : "s"}`;
      lines.push(
        `  ${(path.relative(cwd, item.testFile) || ".").padEnd(28)} (${relation}, ${item.testCases} test case${item.testCases === 1 ? "" : "s"})`,
      );
    }
  }

  lines.push("");
  lines.push(`Total: ${analysis.totalAffectedTestCases} test case${analysis.totalAffectedTestCases === 1 ? "" : "s"} to run`);

  return lines.join("\n");
}
