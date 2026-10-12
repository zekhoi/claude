import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const bin = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const runCli = (...args: string[]) =>
  exec(process.execPath, [bin, ...args], { env: { ...process.env, NO_COLOR: "1" } });

describe("built CLI", () => {
  it("lists the bundled catalog as a single JSON result", async () => {
    const { stdout, stderr } = await runCli("list", "--json");
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      outputSchemaVersion: 1,
      command: "list",
      status: "ok",
      diagnostics: [],
    });
    expect(result.data.items.map((i: { id: string }) => i.id)).toContain("guideline/engineering");
    expect(result.data.presets.map((p: { id: string }) => p.id)).toContain("preset/base");
  });

  it("prints a human-readable catalog", async () => {
    const { stdout } = await runCli("list");
    expect(stdout).toMatch(/^Items:\n {2}guideline\/engineering/);
    expect(stdout).toContain("preset/base");
  });

  it("reports its version", async () => {
    const { stdout } = await runCli("--version");
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exits with 1 on unknown commands", async () => {
    await expect(runCli("frobnicate")).rejects.toMatchObject({ code: 1 });
  });
});
