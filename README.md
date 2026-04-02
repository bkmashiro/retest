# retest

`retest` is a small CLI that uses static import graph analysis to find the test files affected by a changed source file.

It scans `src/` and `test/`, resolves relative imports, builds a directed graph, and then walks the reverse graph from the changed file upward until it reaches tests.

## Install

```bash
pnpm add -D retest
```

Or run locally from this repo:

```bash
pnpm install
pnpm build
node dist/index.js --changed src/auth.ts
```

## Usage

```bash
retest --changed src/auth.ts
retest --git-diff
retest --git-diff --run
retest --changed src/auth.ts --runner "node --import tsx/esm --test"
retest --changed src/auth.ts --json
```

### Options

```text
retest [options]
  --changed <file>   Source file that changed (required or use --git-diff)
  --git-diff         Auto-detect changed files from `git diff --name-only HEAD`
  --run              Actually run the affected tests
  --runner <cmd>     Custom test runner command (default: "node --import tsx/esm --test")
  --cwd <path>       Project directory (default: cwd)
  --json             JSON output (list of affected test files)
  --test-dir <dir>   Where tests live (default: test/)
  --src-dir <dir>    Where source lives (default: src/)
```

## How it works

1. Walk all `.ts` and `.js` files in `src/` and `test/`
2. Parse static relative imports such as `import ... from './path.js'`, `import './path.js'`, and `export ... from './path.js'`
3. Resolve those imports to actual files on disk
4. Build a directed graph: `file -> imported files`
5. Reverse the graph and search upward from changed files until test files are reached

This is fast because it uses a regex-based parser for static relative imports instead of a full AST.

## Example

```text
$ retest --changed src/auth.ts
Analyzing import graph...

Changed: src/auth.ts
Affected tests (via import graph):
  test/auth.test.ts        direct import
  test/api.test.ts         indirect: api.ts -> auth.ts (1 hop)
  test/app.test.ts         indirect: app.ts -> api.ts -> auth.ts (2 hops)

Unaffected (skipping):
  test/db.test.ts

Run: node --import tsx/esm --test test/auth.test.ts test/api.test.ts test/app.test.ts
     (3 of 4 test files)
```

## Compared with `jest --onlyChanged`

`jest --onlyChanged` depends on Jest's own runtime and file tracking. `retest` is runner-agnostic and uses only the static import graph from your source tree. That makes it useful for plain Node test runners, lightweight TypeScript projects, and CI flows where you want a simple file-based dependency check.

## Limitations

- Only static relative imports are tracked
- Dynamic imports and path aliases are ignored
- Resolution is intentionally simple: exact path, `.ts`, `.js`, and `/index` variants
