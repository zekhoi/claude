import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLock } from "../src/core/lock.js";
import { resolveTarget } from "../src/core/target.js";
import { tempDir, writeTree } from "./helpers.js";

const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid!;
const lockJson = (pid: number, host = hostname()) =>
  JSON.stringify({ pid, host, startedAt: "2026-01-01T00:00:00.000Z", command: "init" });

describe("acquireLock", () => {
  it("excludes a second holder and releases cleanly", async () => {
    const root = (await resolveTarget(await tempDir())).root!;
    const first = await acquireLock(root, "init");
    expect(first.lock).toBeDefined();
    const second = await acquireLock(root, "add");
    expect(second.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["LOCK_HELD", "conflict"],
    ]);
    await first.lock!.release();
    const third = await acquireLock(root, "add");
    expect(third.lock).toBeDefined();
    await third.lock!.release();
  });

  it("takes over a lock whose process is confirmed dead on this host", async () => {
    const root = (await resolveTarget(await writeTree({ ".agent-kit/lock": lockJson(deadPid()) })))
      .root!;
    const { lock } = await acquireLock(root, "init");
    expect(lock).toBeDefined();
    expect(JSON.parse(await readFile(path.join(root, ".agent-kit/lock"), "utf8")).pid).toBe(
      process.pid,
    );
    await lock!.release();
  });

  it("never takes over locks from other hosts, live processes, or unreadable lock files", async () => {
    for (const content of [lockJson(deadPid(), "other-host"), lockJson(process.ppid), "garbage"]) {
      const root = (await resolveTarget(await writeTree({ ".agent-kit/lock": content }))).root!;
      expect((await acquireLock(root, "init")).diagnostics[0]?.code).toBe("LOCK_HELD");
    }
  });

  it("ignores lock age", async () => {
    const root = (await resolveTarget(await tempDir())).root!;
    const { lock } = await acquireLock(root, "init");
    await writeFile(path.join(root, ".agent-kit/lock"), lockJson(process.pid));
    expect((await acquireLock(root, "add")).diagnostics[0]?.code).toBe("LOCK_HELD");
    await lock!.release();
  });
});
