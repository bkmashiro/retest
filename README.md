# retest

[![npm](https://img.shields.io/npm/v/retest)](https://www.npmjs.com/package/retest) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
retest --changed src/auth.ts --coverage
retest --watch src/
retest --changed src/auth.ts --runner "node --import tsx/esm --test"
retest --changed src/auth.ts --json
retest --changed src/auth.ts --impact-score
retest --ci-config github-actions
```

### Options

```text
retest [options]
  --changed <file>   Source file that changed (required or use --git-diff)
  --git-diff         Auto-detect changed files from `git diff --name-only HEAD`
  --run              Actually run the affected tests
  --watch [path]     Watch a source directory for changes and rerun affected tests
  --coverage         Show coverage for changed files after running affected tests
  --runner <cmd>     Custom test runner command (default: "node --import tsx/esm --test")
  --cwd <path>       Project directory (default: cwd)
  --json             JSON output (list of affected test files)
  --impact-score     Show a risk score for each changed file
  --ci-config <provider> Generate CI config for github-actions or gitlab
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

```text
$ retest --changed src/auth.ts --coverage
Analyzing import graph...
...

Coverage for src/auth.ts:
  Lines:    87.5% (28/32)
  Branches: 75.0% (6/8)
  Uncovered: lines 45-48, 67
```

```text
$ retest --changed src/auth.ts --impact-score
Impact analysis for src/auth.ts:

Impact score: 50/100 (MEDIUM)
  - 3 test files depend on this file
  - 1 source file directly imports it
  - 3 additional files depend on it transitively
  - src/auth.ts is imported by 25% of source files (1/4)

Affected tests (3):
  test/api.test.ts             (1 hop, 1 test case)
  test/app.test.ts             (2 hops, 1 test case)
  test/auth.test.ts            (direct, 1 test case)

Total: 3 test cases to run
```

```text
$ retest --ci-config github-actions
Generated .github/workflows/smart-test.yml:
  Uses retest to only run tests affected by changed files and falls back to the full suite on main branch
```

```text
$ retest --watch src/
Watching src/ for changes...

[14:23:15] Changed: src/auth.ts
Affected tests: test/auth.test.ts, test/api.test.ts
Running 2 tests...
All passed. Watching...
```

## Compared with `jest --onlyChanged`

`jest --onlyChanged` depends on Jest's own runtime and file tracking. `retest` is runner-agnostic and uses only the static import graph from your source tree. That makes it useful for plain Node test runners, lightweight TypeScript projects, and CI flows where you want a simple file-based dependency check.

## Limitations

- Only static relative imports are tracked
- Dynamic imports and path aliases are ignored
- Resolution is intentionally simple: exact path, `.ts`, `.js`, and `/index` variants
