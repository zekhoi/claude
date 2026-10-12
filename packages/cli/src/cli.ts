import { Command, CommanderError } from "commander";
import { list } from "./commands/list.js";
import { EXIT_ERROR } from "./core/output.js";
import { CLI_VERSION } from "./core/runtime.js";

export async function run(argv: string[]): Promise<number> {
  let exitCode = 0;
  const program = new Command()
    .name("agent-kit")
    .description("Install engineering guidelines, rules, agents, and skills for Claude Code")
    .version(CLI_VERSION)
    .exitOverride()
    .configureOutput({ writeErr: (s) => process.stderr.write(s) });

  program
    .command("list")
    .description("Display the catalog bundled with this CLI version")
    .option("--json", "emit one machine-readable JSON result", false)
    .action(async (opts: { json: boolean }) => {
      exitCode = await list(opts);
    });

  try {
    await program.parseAsync(argv);
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode === 0 ? 0 : EXIT_ERROR;
    throw e;
  }
  return exitCode;
}
