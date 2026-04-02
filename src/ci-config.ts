import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type CiProvider = "github-actions" | "gitlab";

export interface GeneratedCiConfig {
  provider: CiProvider;
  outputPath: string;
  content: string;
  summary: string;
}

function buildGitHubActionsConfig(): string {
  return `name: Smart Test

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  smart-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run full suite on main
        if: github.ref == 'refs/heads/main'
        run: pnpm test
      - name: Run affected tests
        if: github.ref != 'refs/heads/main'
        run: pnpm exec retest --git-diff --run
`;
}

function buildGitLabConfig(): string {
  return `smart-test:
  stage: test
  image: node:22
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - |
      if [ "$CI_COMMIT_BRANCH" = "main" ]; then
        pnpm test
      else
        pnpm exec retest --git-diff --run
      fi
`;
}

export function getCiConfig(provider: CiProvider): Omit<GeneratedCiConfig, "outputPath"> {
  if (provider === "github-actions") {
    return {
      provider,
      content: buildGitHubActionsConfig(),
      summary:
        "Uses retest to only run tests affected by changed files and falls back to the full suite on main branch",
    };
  }

  return {
    provider,
    content: buildGitLabConfig(),
    summary:
      "Adds a smart test stage that uses retest for changed files and runs the full suite on main branch",
  };
}

export async function generateCiConfig(
  cwd: string,
  provider: CiProvider,
): Promise<GeneratedCiConfig> {
  const config = getCiConfig(provider);
  const outputPath =
    provider === "github-actions"
      ? path.resolve(cwd, ".github", "workflows", "smart-test.yml")
      : path.resolve(cwd, ".gitlab-ci.yml");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, config.content, "utf8");

  return {
    ...config,
    outputPath,
  };
}

export function formatCiGenerationMessage(config: GeneratedCiConfig, cwd: string): string {
  const relativeOutput = path.relative(cwd, config.outputPath) || ".";

  if (config.provider === "github-actions") {
    return `Generated ${relativeOutput}:\n  ${config.summary}`;
  }

  return `Generated ${relativeOutput} smart test stage:\n  ${config.summary}`;
}
