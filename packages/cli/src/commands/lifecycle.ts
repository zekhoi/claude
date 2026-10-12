import { error } from "../core/diagnostics.js";
import {
  planEject,
  planInstall,
  planRemove,
  planUninstall,
  planUpdate,
  requiredPaths,
  resolveSelection,
} from "../core/planner.js";
import { readTemplate, type PackagedRegistry } from "../core/registry.js";
import type { AgentId } from "../adapters/index.js";
import type { Diagnostic } from "../core/diagnostics.js";
import type { Manifest } from "../core/schemas.js";
import { mutate } from "./mutate.js";
import type { ApplyHooks } from "../core/writer.js";

interface Common {
  cwd: string;
  /** Install into the user's home directory instead of a project. */
  global?: boolean;
  json: boolean;
  dryRun: boolean;
  diff: boolean;
  hooks?: ApplyHooks;
}

const notInstalled = (command: string): Diagnostic =>
  error("NOT_INSTALLED", "agent-kit is not installed in this target", {
    action: `Run \`agent-kit init\` first, or check --cwd before running ${command}`,
  });

export function install(
  options: Common & {
    command: "init" | "add";
    context: boolean;
    /** Agents to add to the installation; empty keeps the recorded ones (default: claude). */
    agents: AgentId[];
    select: (
      registry: PackagedRegistry,
      manifest: Manifest | undefined,
    ) => Promise<string[] | Diagnostic>;
  },
): Promise<number> {
  const scope = options.global ? ("user" as const) : ("project" as const);
  return mutate({
    ...options,
    prepare: async ({ registry, manifest, cliVersion }) => {
      const ids = await options.select(registry, manifest);
      if (!Array.isArray(ids)) return [ids];
      const selection = resolveSelection(registry, ids);
      if (!selection.request) return selection.diagnostics;
      const request = {
        ...selection.request,
        context: options.context,
        agents: options.agents,
        scope,
      };
      const contextTemplate = request.context
        ? await readTemplate(registry, "agent-context.md")
        : "";
      return {
        paths: requiredPaths(registry, manifest, request.items, {
          context: request.context,
          agents: request.agents,
          scope,
        }),
        plan: (files) =>
          planInstall({ registry, manifest, files, cliVersion, request, contextTemplate }),
      };
    },
  });
}

export function update(options: Common & { ids: string[]; allowMajor: boolean }): Promise<number> {
  return mutate({
    ...options,
    command: "update",
    prepare: async ({ registry, manifest, cliVersion }) => {
      if (!manifest) return [notInstalled("update")];
      return {
        paths: requiredPaths(registry, manifest, registry.index.items),
        plan: (files) =>
          planUpdate({
            registry,
            manifest,
            files,
            cliVersion,
            ids: options.ids,
            allowMajor: options.allowMajor,
          }),
      };
    },
  });
}

export function removeOrEject(
  options: Common & { command: "remove" | "eject"; ids: string[] },
): Promise<number> {
  const planner = options.command === "remove" ? planRemove : planEject;
  return mutate({
    ...options,
    prepare: async ({ registry, manifest, cliVersion }) => {
      if (!manifest) return [notInstalled(options.command)];
      return {
        paths: requiredPaths(registry, manifest),
        plan: (files) => planner({ registry, manifest, files, cliVersion, ids: options.ids }),
      };
    },
  });
}

export function uninstall(options: Common): Promise<number> {
  return mutate({
    ...options,
    command: "uninstall",
    prepare: async ({ registry, manifest, cliVersion }) => ({
      paths: requiredPaths(registry, manifest),
      plan: (files) => planUninstall({ registry, manifest, files, cliVersion }),
    }),
  });
}
