import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

export type ImportGraph = Map<string, Set<string>>;

export interface GraphOptions {
  cwd: string;
  srcDir: string;
  testDir: string;
}

export function extractRelativeImports(source: string): string[] {
  const imports = new Set<string>();

  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (specifier?.startsWith(".")) {
      imports.add(specifier);
    }
  }

  return [...imports];
}

export async function walkCodeFiles(rootDir: string): Promise<string[]> {
  try {
    const rootStat = await stat(rootDir);
    if (!rootStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
        files.push(entryPath);
      }
    }
  }

  files.sort();
  return files;
}

export async function resolveImportPath(
  fromFile: string,
  specifier: string,
): Promise<string | null> {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const ext = path.extname(base);
  const extensionlessBase = ext ? base.slice(0, -ext.length) : base;
  const candidates = [
    base,
    `${extensionlessBase}.ts`,
    `${extensionlessBase}.js`,
    `${base}.ts`,
    `${base}.js`,
    path.join(extensionlessBase, "index.ts"),
    path.join(extensionlessBase, "index.js"),
    path.join(base, "index.ts"),
    path.join(base, "index.js"),
  ];

  for (const candidate of candidates) {
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) {
        return path.resolve(candidate);
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function parseImportsFromFile(filePath: string): Promise<Set<string>> {
  const source = await readFile(filePath, "utf8");
  const imports = extractRelativeImports(source);
  const resolved = await Promise.all(
    imports.map((specifier) => resolveImportPath(filePath, specifier)),
  );

  return new Set(resolved.filter((value): value is string => value !== null));
}

export async function buildImportGraph(options: GraphOptions): Promise<ImportGraph> {
  const srcRoot = path.resolve(options.cwd, options.srcDir);
  const testRoot = path.resolve(options.cwd, options.testDir);
  const files = [
    ...(await walkCodeFiles(srcRoot)),
    ...(await walkCodeFiles(testRoot)),
  ];
  const graph: ImportGraph = new Map();

  for (const file of files) {
    graph.set(path.resolve(file), await parseImportsFromFile(file));
  }

  return graph;
}
