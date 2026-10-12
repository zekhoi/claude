import type { Diagnostic } from "../core/diagnostics.js";
import type { InstallMode, PackagedItem } from "../core/schemas.js";
import { parseFrontmatter, validateContent } from "./claude.js";
import { renderCodex, validateCodexFile } from "./codex.js";

/** Coding agents the CLI can install for. */
export const AGENT_IDS = ["claude", "codex"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/** A file as it will exist in the target for a given agent. */
export interface RenderedFile {
  destination: string;
  install: InstallMode;
  content: string;
  /** Registry source the file is rendered from. */
  source: string;
}

function renderClaude(item: PackagedItem, contents: ReadonlyMap<string, string>): RenderedFile[] {
  return item.files.map((f) => ({
    destination: f.destination,
    install: f.install,
    source: f.source,
    content: contents.get(f.source)!,
  }));
}

/**
 * Renders an item for every agent, deduplicating shared destinations such as the AGENTS.md block.
 * The registry stores the canonical (Claude Code) layout; other agents derive from it.
 */
export function renderItem(
  item: PackagedItem,
  contents: ReadonlyMap<string, string>,
  agents: readonly AgentId[],
): RenderedFile[] {
  const files = new Map<string, RenderedFile>();
  for (const agent of AGENT_IDS.filter((a) => agents.includes(a))) {
    const rendered =
      agent === "claude" ? renderClaude(item, contents) : renderCodex(item, contents);
    for (const file of rendered)
      if (!files.has(file.destination)) files.set(file.destination, file);
  }
  return [...files.values()];
}

/** Format checks for files rendered for agents other than Claude Code (validated at the source). */
export function validateRendered(
  item: PackagedItem,
  file: RenderedFile,
  agent: AgentId,
): Diagnostic[] {
  return agent === "codex" ? validateCodexFile(item, file) : [];
}

/**
 * The tool and invocation name an installed file declares, for collision checks. Skills and agents
 * are separate namespaces per tool; files that are not invocable return undefined.
 */
export function invocationName(
  destination: string,
  content: string | undefined,
): { namespace: string; name: string } | undefined {
  const skill = /^(\.claude|\.agents)\/skills\/([^/]+)\/SKILL\.md$/.exec(destination);
  if (skill) {
    const declared = content === undefined ? undefined : parseFrontmatter(content)?.["name"];
    return {
      namespace: skill[1] === ".claude" ? "Claude Code skills" : "Codex skills",
      name: typeof declared === "string" ? declared : skill[2]!,
    };
  }
  const claudeAgent = /^\.claude\/agents\/([^/]+)\.md$/.exec(destination);
  if (claudeAgent) {
    const declared = content === undefined ? undefined : parseFrontmatter(content)?.["name"];
    return {
      namespace: "Claude Code subagents",
      name: typeof declared === "string" ? declared : claudeAgent[1]!,
    };
  }
  const codexAgent = /^\.codex\/agents\/(.+)\.toml$/.exec(destination);
  if (codexAgent) {
    const declared = content === undefined ? undefined : /^name = "([^"]*)"/m.exec(content)?.[1];
    return { namespace: "Codex subagents", name: declared ?? codexAgent[1]! };
  }
  return undefined;
}

/** Validates an installed file in the format of the agent that reads it. */
export function validateInstalledFile(
  item: Pick<PackagedItem, "id" | "type" | "version">,
  destination: string,
  content: string,
): Diagnostic[] {
  const file = { destination, install: "file" as const, content, source: destination };
  if (destination.startsWith(".claude/")) {
    return validateContent(item as PackagedItem, file, content);
  }
  if (destination.startsWith(".agents/") || destination.startsWith(".codex/")) {
    return validateCodexFile(item as PackagedItem, file);
  }
  return [];
}
