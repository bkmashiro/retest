import assert from "node:assert/strict";
import test from "node:test";

import { createDebouncedBatcher } from "../src/watcher.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("createDebouncedBatcher collapses rapid changes into one flush", async () => {
  const batches: string[][] = [];
  const enqueue = createDebouncedBatcher<string>({
    delayMs: 25,
    onFlush: async (items) => {
      batches.push(items.sort());
    },
  });

  enqueue("src/auth.ts");
  enqueue("src/auth.ts");
  enqueue("src/api.ts");
  await wait(60);

  assert.deepEqual(batches, [["src/api.ts", "src/auth.ts"]]);
});

test("createDebouncedBatcher starts a new batch after the debounce window", async () => {
  const batches: string[][] = [];
  const enqueue = createDebouncedBatcher<string>({
    delayMs: 20,
    onFlush: async (items) => {
      batches.push(items);
    },
  });

  enqueue("src/auth.ts");
  await wait(45);
  enqueue("src/db.ts");
  await wait(45);

  assert.deepEqual(batches, [["src/auth.ts"], ["src/db.ts"]]);
});
