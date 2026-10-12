import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const bin = fileURLToPath(new URL("../dist/index.js", import.meta.url));

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
  signal?: string | null;
}

/** Runs the built CLI against `cwd`, never throwing on nonzero exit codes. */
export async function kit(
  cwd: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<Run> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [bin, ...args, "--cwd", cwd], {
      env: { ...process.env, NO_COLOR: "1", ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout: string; stderr: string; signal?: string | null };
    return {
      code: err.code ?? -1,
      stdout: err.stdout,
      stderr: err.stderr,
      signal: err.signal ?? null,
    };
  }
}

export async function json(cwd: string, args: string[]) {
  const run = await kit(cwd, [...args, "--json"]);
  return { ...run, result: JSON.parse(run.stdout) };
}

export const codesOf = (result: { diagnostics: { code: string }[] }) =>
  result.diagnostics.map((d) => d.code);

/** True when the test-only hook terminated the CLI (SIGKILL, or exit code 86 on Windows). */
export const wasKilled = (run: Run) => run.signal === "SIGKILL" || run.code === 86;
