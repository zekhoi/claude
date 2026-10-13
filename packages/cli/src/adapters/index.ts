import { parse as parseToml } from "smol-toml";
import type { Diagnostic } from "../core/diagnostics.js";
import type { InstallMode, PackagedItem } from "../core/schemas.js";
import { parseFrontmatter, validateContent } from "./claude.js";
import { renderCodex, validateCodexFile } from "./codex.js";

/** `project` installs into a repository; `user` installs into the home directory. */
export type Scope = "project" | "user";

/** Where each agent reads user-level guidelines (relative to the home directory). */
export const USER_GUIDELINES: Record<AgentId, string> = {
  claude: ".claude/CLAUDE.md",
  codex: ".codex/AGENTS.md",
};

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
 * Renders an item for every agent, deduplicating shared destinations such as the project AGENTS.md
 * block. The registry stores the canonical (Claude Code) project layout; other agents and the user
 * scope derive from it. At user scope each agent reads guidelines from its own file.
 */
export function renderItem(
  item: PackagedItem,
  contents: ReadonlyMap<string, string>,
  agents: readonly AgentId[],
  scope: Scope = "project",
): RenderedFile[] {
  const files = new Map<string, RenderedFile>();
  for (const agent of AGENT_IDS.filter((a) => agents.includes(a))) {
    const rendered =
      agent === "claude" ? renderClaude(item, contents) : renderCodex(item, contents);
    for (const file of rendered) {
      const placed =
        scope === "user" && file.install === "managed-block"
          ? { ...file, destination: USER_GUIDELINES[agent] }
          : file;
      if (!files.has(placed.destination)) files.set(placed.destination, placed);
    }
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
    let declared: string | undefined;
    try {
      const name = content === undefined ? undefined : parseToml(content)["name"];
      declared = typeof name === "string" ? name : undefined;
    } catch {
      declared = undefined;
    }
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

/** Files that can hold a guidelines block, and the CLAUDE.md import block. */
export const GUIDELINE_BLOCK_FILES = ["AGENTS.md", USER_GUIDELINES.claude, USER_GUIDELINES.codex];
export const BLOCK_FILES = [...GUIDELINE_BLOCK_FILES, "CLAUDE.md"];

const NAME = "kit-[a-z0-9]+(?:-[a-z0-9]+)*";
const SUPPORT = "(?:references|scripts|assets)";
/** Every file location an installed item can occupy, for any agent and scope. */
const MANAGED_FILES = [
  new RegExp(`^\\.claude/skills/${NAME}/(?:SKILL\\.md|${SUPPORT}/.+)$`),
  new RegExp(`^\\.agents/skills/${NAME}/(?:SKILL\\.md|${SUPPORT}/.+)$`),
  new RegExp(`^\\.claude/agents/${NAME}\\.md$`),
  new RegExp(`^\\.codex/agents/${NAME}\\.toml$`),
  /^\.claude\/rules\/agent-kit\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
];
/** Every directory agent-kit can create, so only those are ever pruned. */
const MANAGED_DIRS = [
  new RegExp(
    `^\\.claude(?:/(?:skills(?:/${NAME}(?:/${SUPPORT}(?:/[^/]+)*)?)?|agents|rules(?:/agent-kit)?))?$`,
  ),
  new RegExp(`^\\.agents(?:/skills(?:/${NAME}(?:/${SUPPORT}(?:/[^/]+)*)?)?)?$`),
  /^\.codex(?:\/agents)?$/,
  /^docs$/,
];

const hasGitSegment = (p: string) => p.split("/").some((s) => s.toLowerCase() === ".git");

/** True for a destination agent-kit can manage with the given install mode. */
export function isManagedDestination(destination: string, install: InstallMode): boolean {
  if (hasGitSegment(destination)) return false;
  return install === "managed-block"
    ? GUIDELINE_BLOCK_FILES.includes(destination)
    : MANAGED_FILES.some((pattern) => pattern.test(destination));
}

/**
 * True when `destination` is a slot the given item itself can occupy, so one item's manifest
 * entry can never claim another item's (or the user's) file. `id` must be a validated item id.
 */
export function isItemDestination(id: string, destination: string, install: InstallMode): boolean {
  if (!isManagedDestination(destination, install)) return false;
  const [type, name] = id.split("/") as [string, string];
  const skill = `kit-${name}`;
  switch (type) {
    case "guideline":
      return install === "managed-block";
    case "skill":
      return [".claude/skills/", ".agents/skills/"].some((dir) =>
        destination.startsWith(`${dir}${skill}/`),
      );
    case "agent":
      return [`.claude/agents/${skill}.md`, `.codex/agents/${skill}.toml`].includes(destination);
    case "rule":
      return [
        `.claude/rules/agent-kit/${name}.md`,
        `.agents/skills/${skill}-rules/SKILL.md`,
      ].includes(destination);
    default:
      return false;
  }
}

/** True for a directory agent-kit can have created. */
export function isManagedDirectory(dir: string): boolean {
  return !hasGitSegment(dir) && MANAGED_DIRS.some((pattern) => pattern.test(dir));
}
