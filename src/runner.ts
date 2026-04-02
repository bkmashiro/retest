import { spawn } from "node:child_process";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function runTests(
  runner: string,
  testFiles: string[],
  cwd: string,
): Promise<number> {
  if (testFiles.length === 0) {
    return 0;
  }

  const command = `${runner} ${testFiles.map(shellQuote).join(" ")}`;

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
