import { createInterface } from "node:readline/promises";
import { Command, CommanderError, Option } from "commander";
import { doctor } from "./commands/doctor.js";
import { install, removeOrEject, uninstall, update } from "./commands/lifecycle.js";
import { list } from "./commands/list.js";
import { show } from "./commands/show.js";
import { status } from "./commands/status.js";
import { error, type Diagnostic } from "./core/diagnostics.js";
import { EXIT_ERROR } from "./core/output.js";
import type { PackagedRegistry } from "./core/registry.js";
import { CLI_VERSION } from "./core/runtime.js";
import type { ApplyHooks } from "./core/writer.js";

interface CommonOptions {
  cwd: string;
  json: boolean;
}

const presetId = (name: string) => (name.startsWith("preset/") ? name : `preset/${name}`);

/** Exit code used by the test-only termination hook where signals are unavailable (Windows). */
export const TEST_KILL_EXIT_CODE = 86;

/**
 * Test-only: `AGENT_KIT_TEST_KILL_AT=<n>` terminates the process before the n-th mutation step,
 * without running cleanup, so integration tests can verify recovery from a real interruption.
 */
function testHooks(): ApplyHooks | undefined {
  const killAt = Number(process.env["AGENT_KIT_TEST_KILL_AT"]);
  if (!Number.isInteger(killAt) || killAt < 1) return undefined;
  let count = 0;
  return {
    onStep: () => {
      if (++count !== killAt) return;
      if (process.platform === "win32") process.exit(TEST_KILL_EXIT_CODE);
      process.kill(process.pid, "SIGKILL");
    },
  };
}

/** Asks for presets on an interactive terminal; noninteractive runs must pass --preset. */
async function promptPresets(registry: PackagedRegistry): Promise<string[] | Diagnostic> {
  const required = error("INPUT_REQUIRED", "init needs a preset selection", {
    action: "Pass --preset <name> (repeatable), for example: agent-kit init --preset base",
  });
  if (!process.stdin.isTTY || !process.stderr.isTTY) return required;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    process.stderr.write("Available presets:\n");
    for (const p of registry.index.presets) {
      process.stderr.write(`  ${p.id.slice("preset/".length).padEnd(10)} ${p.description}\n`);
    }
    const answer = (await rl.question("Presets to install (comma-separated) [base]: ")).trim();
    const names = answer === "" ? ["base"] : answer.split(/[\s,]+/).filter(Boolean);
    return names.map(presetId);
  } finally {
    rl.close();
  }
}

function withCommon(command: Command): Command {
  return command
    .option("--cwd <path>", "target directory (default: current directory)", process.cwd())
    .option("--json", "emit one machine-readable JSON result on stdout", false);
}

export async function run(argv: string[]): Promise<number> {
  let exitCode = 0;
  const program = new Command()
    .name("agent-kit")
    .description("Install engineering guidelines, rules, agents, and skills for Claude Code")
    .version(CLI_VERSION)
    .exitOverride()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });

  withCommon(program.command("list"))
    .description("Display the catalog bundled with this CLI version")
    .action(async (opts: CommonOptions) => {
      exitCode = await list(opts);
    });

  withCommon(program.command("show"))
    .description("Print an item's bundled files for comparison or manual restore")
    .argument("<type/name>", "item id, for example skill/code-review")
    .option("--file <destination>", "print only the file installed at this destination")
    .action(async (id: string, opts: CommonOptions & { file?: string }) => {
      exitCode = await show(id, opts);
    });

  withCommon(program.command("init"))
    .description("Install presets and the core guidelines into the target")
    .addOption(
      new Option("--preset <name>", "preset to install (repeatable)").argParser(
        (value: string, previous: string[] = []) => [...previous, value],
      ),
    )
    .option("--context", "create a project-owned docs/agent-context.md template", false)
    .option("--dry-run", "show the planned changes without writing anything", false)
    .action(
      async (opts: CommonOptions & { preset?: string[]; context: boolean; dryRun: boolean }) => {
        exitCode = await install({
          command: "init",
          cwd: opts.cwd,
          json: opts.json,
          dryRun: opts.dryRun,
          context: opts.context,
          select: async (registry) =>
            opts.preset
              ? opts.preset.map(presetId)
              : opts.json
                ? error("INPUT_REQUIRED", "init needs a preset selection", {
                    action: "Pass --preset <name> (repeatable)",
                  })
                : promptPresets(registry),
          ...withHooks(),
        });
      },
    );

  withCommon(program.command("add"))
    .description("Install items or presets (preset/<name>)")
    .argument("<ids...>", "item or preset ids, for example skill/code-review preset/node")
    .option("--dry-run", "show the planned changes without writing anything", false)
    .action(async (ids: string[], opts: CommonOptions & { dryRun: boolean }) => {
      exitCode = await install({
        command: "add",
        cwd: opts.cwd,
        json: opts.json,
        dryRun: opts.dryRun,
        context: false,
        select: async () => ids,
        ...withHooks(),
      });
    });

  withCommon(program.command("status"))
    .description("Show installed items, local changes, and missing files (read-only)")
    .action(async (opts: CommonOptions) => {
      exitCode = await status(opts);
    });

  withCommon(program.command("update"))
    .description("Update installed items; with no ids, update all and skip items with conflicts")
    .argument("[ids...]", "installed item ids to update")
    .option("--allow-major", "allow major version updates for the selected items", false)
    .option("--dry-run", "show the planned changes without writing anything", false)
    .action(
      async (ids: string[], opts: CommonOptions & { allowMajor: boolean; dryRun: boolean }) => {
        exitCode = await update({ ...opts, ids, ...withHooks() });
      },
    );

  for (const [name, description] of [
    ["remove", "Delete installed items whose files have not been modified"],
    ["eject", "Stop managing items and keep their files as your own"],
  ] as const) {
    withCommon(program.command(name))
      .description(description)
      .argument("<ids...>", "installed item ids")
      .option("--dry-run", "show the planned changes without writing anything", false)
      .action(async (ids: string[], opts: CommonOptions & { dryRun: boolean }) => {
        exitCode = await removeOrEject({ ...opts, command: name, ids, ...withHooks() });
      });
  }

  withCommon(program.command("uninstall"))
    .description("Remove every managed item and block; keeps your own content and project context")
    .option("--dry-run", "show the planned changes without writing anything", false)
    .action(async (opts: CommonOptions & { dryRun: boolean }) => {
      exitCode = await uninstall({ ...opts, ...withHooks() });
    });

  withCommon(program.command("doctor"))
    .description("Check the installation and report problems without changing anything")
    .action(async (opts: CommonOptions) => {
      exitCode = await doctor(opts);
    });

  try {
    await program.parseAsync(argv);
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode === 0 ? 0 : EXIT_ERROR;
    throw e;
  }
  return exitCode;
}

function withHooks(): { hooks?: ApplyHooks } {
  const hooks = testHooks();
  return hooks ? { hooks } : {};
}
