import path from "node:path";

import type { ImportGraph } from "./graph.js";

export interface AffectedTest {
  testFile: string;
  changedFile: string;
  chain: string[];
}

export function isTestFile(filePath: string, testRoot: string): boolean {
  const relative = path.relative(testRoot, filePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function buildReverseGraph(graph: ImportGraph): ImportGraph {
  const reverse: ImportGraph = new Map();

  for (const [file, imports] of graph.entries()) {
    if (!reverse.has(file)) {
      reverse.set(file, new Set());
    }

    for (const importedFile of imports) {
      const importers = reverse.get(importedFile) ?? new Set<string>();
      importers.add(file);
      reverse.set(importedFile, importers);
    }
  }

  return reverse;
}

export function findAffectedTests(
  graph: ImportGraph,
  changedFiles: string[],
  testRoot: string,
): AffectedTest[] {
  const reverse = buildReverseGraph(graph);
  const results = new Map<string, AffectedTest>();

  for (const changedFile of changedFiles) {
    const resolvedChanged = path.resolve(changedFile);
    const queue = [resolvedChanged];
    const distances = new Map<string, number>([[resolvedChanged, 0]]);
    const parents = new Map<string, string | null>([[resolvedChanged, null]]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const importers = reverse.get(current);
      if (!importers) {
        continue;
      }

      for (const importer of importers) {
        const nextDistance = (distances.get(current) ?? 0) + 1;
        const knownDistance = distances.get(importer);

        if (knownDistance !== undefined && knownDistance <= nextDistance) {
          continue;
        }

        distances.set(importer, nextDistance);
        parents.set(importer, current);
        queue.push(importer);
      }
    }

    for (const [file] of distances.entries()) {
      if (!isTestFile(file, testRoot)) {
        continue;
      }

      const chain: string[] = [];
      let cursor: string | null | undefined = file;
      while (cursor) {
        chain.push(cursor);
        cursor = parents.get(cursor);
      }

      const existing = results.get(file);
      if (!existing || chain.length < existing.chain.length) {
        results.set(file, {
          testFile: file,
          changedFile: resolvedChanged,
          chain,
        });
      }
    }
  }

  return [...results.values()].sort((a, b) => a.testFile.localeCompare(b.testFile));
}
