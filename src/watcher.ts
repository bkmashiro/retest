import { watch } from "node:fs";
import path from "node:path";

import { findAffectedTests } from "./finder.js";
import { buildImportGraph } from "./graph.js";
import {
  formatCoverageSummary,
  runTests,
  runTestsWithCoverage,
} from "./runner.js";

export interface WatchOptions {
  cwd: string;
  srcDir: string;
  testDir: string;
  runner: string;
  coverage?: boolean;
  debounceMs?: number;
  onIdle?: () => void;
}

interface DebounceOptions<T> {
  delayMs: number;
  onFlush: (items: T[]) => void | Promise<void>;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export function createDebouncedBatcher<T>({
  delayMs,
  onFlush,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}: DebounceOptions<T>): (item: T) => void {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Set<T>();

  return (item: T) => {
    pending.add(item);

    if (timer) {
      clearTimeoutFn(timer);
    }

    timer = setTimeoutFn(async () => {
      timer = undefined;
      const items = [...pending];
      pending.clear();
      await onFlush(items);
    }, delayMs);
  };
}

export async function watchAndRun(
  watchTarget: string,
  options: WatchOptions,
): Promise<void> {
  const watchRoot = path.resolve(options.cwd, watchTarget);
  const displayTarget = normalizeDisplayPath(options.cwd, watchRoot);
  process.stdout.write(`Watching ${displayTarget} for changes...\n`);

  let queuedPaths = new Set<string>();
  let isRunning = false;

  const drainQueue = async (): Promise<void> => {
    if (isRunning || queuedPaths.size === 0) {
      return;
    }

    isRunning = true;
    const changedFiles = [...queuedPaths].sort();
    queuedPaths = new Set();

    try {
      await runAffectedTests(changedFiles, options);
    } finally {
      isRunning = false;
      if (queuedPaths.size > 0) {
        await drainQueue();
      } else {
        options.onIdle?.();
      }
    }
  };

  const enqueue = createDebouncedBatcher<string>({
    delayMs: options.debounceMs ?? 200,
    onFlush: async (items) => {
      for (const item of items) {
        queuedPaths.add(item);
      }
      await drainQueue();
    },
  });

  const watcher = watch(
    watchRoot,
    { recursive: true },
    (_eventType, filename) => {
      if (!filename) {
        return;
      }

      const changedFile = path.resolve(watchRoot, filename.toString());
      enqueue(changedFile);
    },
  );

  watcher.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });

  await new Promise<void>(() => {});
}

async function runAffectedTests(
  changedFiles: string[],
  options: WatchOptions,
): Promise<void> {
  const graph = await buildImportGraph({
    cwd: options.cwd,
    srcDir: options.srcDir,
    testDir: options.testDir,
  });
  const testRoot = path.resolve(options.cwd, options.testDir);
  const affected = findAffectedTests(graph, changedFiles, testRoot);
  const affectedTests = affected.map((item) => path.relative(options.cwd, item.testFile));

  process.stdout.write(`\n[${formatTimestamp()}] Changed: ${changedFiles.map((file) => normalizeDisplayPath(options.cwd, file)).join(", ")}\n`);
  process.stdout.write(`Affected tests: ${affectedTests.length > 0 ? affectedTests.join(", ") : "(none)"}\n`);

  if (affectedTests.length === 0) {
    process.stdout.write(`Running 0 tests...\n`);
    process.stdout.write(`All passed. Watching...\n`);
    return;
  }

  process.stdout.write(`Running ${affectedTests.length} test${affectedTests.length === 1 ? "" : "s"}...\n`);
  const result = options.coverage
    ? await runTestsWithCoverage(options.runner, affectedTests, options.cwd, changedFiles)
    : { exitCode: await runTests(options.runner, affectedTests, options.cwd), summaries: [] };

  if (options.coverage) {
    for (const summary of result.summaries) {
      process.stdout.write(`\n${formatCoverageSummary(summary, options.cwd)}\n`);
    }
  }

  if (result.exitCode === 0) {
    process.stdout.write(`All passed. Watching...\n`);
    return;
  }

  process.stdout.write(`Tests failed. Watching...\n`);
  process.exitCode = result.exitCode;
}

function formatTimestamp(date = new Date()): string {
  return date.toTimeString().slice(0, 8);
}

function normalizeDisplayPath(cwd: string, filePath: string): string {
  const relative = path.relative(cwd, filePath);
  return relative === "" ? "." : relative;
}
