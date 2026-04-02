import path from "node:path";

import chalk from "chalk";

import type { AffectedTest } from "./finder.js";

export interface ReportData {
  changedFiles: string[];
  affected: AffectedTest[];
  unaffected: string[];
  cwd: string;
  runner: string;
  totalTests: number;
}

function rel(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath) || ".";
}

function describeChain(cwd: string, chain: string[]): string {
  if (chain.length <= 2) {
    return "direct import";
  }

  const modules = chain.slice(1).map((segment) => path.basename(rel(cwd, segment)));
  return `indirect: ${modules.join(" -> ")} (${chain.length - 2} hop${
    chain.length - 2 === 1 ? "" : "s"
  })`;
}

export function formatReport(data: ReportData): string {
  const lines: string[] = [];

  lines.push(chalk.cyan("Analyzing import graph..."));
  lines.push("");

  lines.push(chalk.bold("Changed:"));
  for (const changedFile of data.changedFiles) {
    lines.push(`  ${rel(data.cwd, changedFile)}`);
  }

  lines.push("");
  lines.push(chalk.bold("Affected tests (via import graph):"));
  if (data.affected.length === 0) {
    lines.push("  (none)");
  } else {
    for (const item of data.affected) {
      lines.push(
        `  ${rel(data.cwd, item.testFile).padEnd(24)} ${describeChain(data.cwd, item.chain)}`,
      );
    }
  }

  lines.push("");
  lines.push(chalk.bold("Unaffected (skipping):"));
  if (data.unaffected.length === 0) {
    lines.push("  (none)");
  } else {
    for (const testFile of data.unaffected) {
      lines.push(`  ${rel(data.cwd, testFile)}`);
    }
  }

  lines.push("");
  const affectedArgs = data.affected.map((item) => rel(data.cwd, item.testFile)).join(" ");
  lines.push(`Run: ${data.runner}${affectedArgs ? ` ${affectedArgs}` : ""}`);
  lines.push(`     (${data.affected.length} of ${data.totalTests} test files)`);

  return lines.join("\n");
}
