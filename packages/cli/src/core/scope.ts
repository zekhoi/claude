import { homedir } from "node:os";
import path from "node:path";
import type { AgentId, Scope } from "../adapters/index.js";
import { error, type Diagnostic } from "./diagnostics.js";
import type { Manifest } from "./schemas.js";
import { resolveTarget } from "./target.js";

/** Where a command operates: a project directory, or the user's home directory (`--global`). */
export interface Where {
  cwd: string;
  global?: boolean;
}

export const scopeOf = (where: Where): Scope => (where.global ? "user" : "project");

/** Resolves the target directory for a command's scope. */
export async function resolveWhere(
  where: Where,
): Promise<{ root?: string; scope: Scope; diagnostics: Diagnostic[] }> {
  const scope = scopeOf(where);
  const { root, diagnostics } = await resolveTarget(scope === "user" ? homedir() : where.cwd);
  return { ...(root ? { root } : {}), scope, diagnostics };
}

/** Environment variables that move an agent's user directory away from the home directory. */
const RELOCATIONS: Record<AgentId, { variable: string; dir: string }> = {
  claude: { variable: "CLAUDE_CONFIG_DIR", dir: ".claude" },
  codex: { variable: "CODEX_HOME", dir: ".codex" },
};

/**
 * Refuses to work on an installation of the other scope, and refuses user-scope installs for
 * agents whose configuration directory was relocated, which agent-kit does not support yet.
 */
export function checkScope(
  manifest: Manifest | undefined,
  scope: Scope,
  agents: readonly AgentId[],
  env: NodeJS.ProcessEnv = process.env,
): Diagnostic[] {
  if (manifest && manifest.scope !== scope) {
    const global = manifest.scope === "user";
    return [
      error(
        "SCOPE_MISMATCH",
        `this directory holds a ${global ? "global" : "project"} installation`,
        {
          path: ".agent-kit/manifest.json",
          action: global
            ? "Rerun the command with --global"
            : "Rerun without --global, or run it from the project directory",
        },
      ),
    ];
  }
  if (scope !== "user") return [];
  const home = homedir();
  return agents.flatMap((agent) => {
    const { variable, dir } = RELOCATIONS[agent];
    const value = env[variable];
    if (!value || path.resolve(value) === path.join(home, dir)) return [];
    return [
      error("TARGET_INVALID", `${variable} relocates the ${agent} configuration directory`, {
        path: value,
        action: `Global installation for ${agent} supports only ~/${dir}; unset ${variable} or install per project`,
      }),
    ];
  });
}
