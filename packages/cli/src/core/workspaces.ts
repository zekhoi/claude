import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

/** `**` matches at most this many directory levels, to keep scans bounded. */
const MAX_DEPTH = 5;

async function declaredPatterns(root: string): Promise<string[]> {
  const patterns: string[] = [];
  try {
    const pnpm = parseYaml(await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8")) as {
      packages?: unknown;
    } | null;
    if (Array.isArray(pnpm?.packages)) patterns.push(...pnpm.packages.map(String));
  } catch {
    // No pnpm workspace file, or one that does not parse.
  }
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      workspaces?: unknown;
    };
    const ws = pkg.workspaces;
    const list = Array.isArray(ws) ? ws : (ws as { packages?: unknown } | undefined)?.packages;
    if (Array.isArray(list)) patterns.push(...list.map(String));
  } catch {
    // No package.json, or no workspaces field.
  }
  return patterns;
}

async function subdirectories(root: string, rel: string): Promise<string[]> {
  const entries = await readdir(path.join(root, ...rel.split("/").filter(Boolean)), {
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith("."))
    .map((e) => (rel ? `${rel}/${e.name}` : e.name));
}

async function expand(root: string, pattern: string): Promise<string[]> {
  const segments = pattern.replace(/^\.\//, "").replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.some((s) => s === "..")) return [];
  const results: string[] = [];
  const walk = async (rel: string, rest: string[], depth: number): Promise<void> => {
    if (rest.length === 0) {
      if (rel) results.push(rel);
      return;
    }
    const [segment, ...tail] = rest as [string, ...string[]];
    if (segment === "**") {
      await walk(rel, tail, depth);
      if (depth >= MAX_DEPTH) return;
      for (const dir of await subdirectories(root, rel)) await walk(dir, rest, depth + 1);
    } else if (segment.includes("*")) {
      const matcher = new RegExp(
        `^${segment
          .split("*")
          .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*")}$`,
      );
      for (const dir of await subdirectories(root, rel)) {
        if (matcher.test(path.posix.basename(dir))) await walk(dir, tail, depth);
      }
    } else {
      const next = rel ? `${rel}/${segment}` : segment;
      if ((await subdirectories(root, rel)).includes(next)) await walk(next, tail, depth);
    }
  };
  await walk("", segments, 0);
  return results;
}

/**
 * Workspace package directories declared by pnpm-workspace.yaml or package.json `workspaces`,
 * relative to `root` with forward slashes. Only declared patterns are expanded.
 */
export async function workspacePackages(root: string): Promise<string[]> {
  const patterns = await declaredPatterns(root);
  const included = new Set<string>();
  const excluded = new Set<string>();
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    for (const dir of await expand(root, negated ? pattern.slice(1) : pattern)) {
      (negated ? excluded : included).add(dir);
    }
  }
  return [...included].filter((dir) => !excluded.has(dir)).sort();
}
