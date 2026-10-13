import { readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { readRegularFile } from "./safe-read.js";

/** `**` matches at most this many directory levels, to keep scans bounded. */
const MAX_DEPTH = 5;
/** Hostile workspace files cannot make the scan arbitrarily large. */
const MAX_PATTERNS = 64;
const MAX_SEGMENTS = 16;
/** Directory listings per scan; beyond this, deeper matches are skipped rather than stalling. */
const MAX_READS = 10_000;

/** Directory listings shared by every pattern in one scan, with the read budget. */
interface Scan {
  root: string;
  listings: Map<string, Promise<string[]>>;
}

async function declaredPatterns(root: string): Promise<string[]> {
  const patterns: string[] = [];
  try {
    const read = await readRegularFile(path.join(root, "pnpm-workspace.yaml"));
    if (read.state !== "file") throw new Error("no workspace file");
    const pnpm = parseYaml(read.text) as {
      packages?: unknown;
    } | null;
    if (Array.isArray(pnpm?.packages)) patterns.push(...pnpm.packages.map(String));
  } catch {
    // No pnpm workspace file, or one that does not parse.
  }
  try {
    const read = await readRegularFile(path.join(root, "package.json"));
    if (read.state !== "file") throw new Error("no package.json");
    const pkg = JSON.parse(read.text) as {
      workspaces?: unknown;
    };
    const ws = pkg.workspaces;
    const list = Array.isArray(ws) ? ws : (ws as { packages?: unknown } | undefined)?.packages;
    if (Array.isArray(list)) patterns.push(...list.map(String));
  } catch {
    // No package.json, or no workspaces field.
  }
  return patterns.slice(0, MAX_PATTERNS);
}

function subdirectories(scan: Scan, rel: string): Promise<string[]> {
  let listing = scan.listings.get(rel);
  if (listing === undefined) {
    listing =
      scan.listings.size >= MAX_READS
        ? Promise.resolve([])
        : readdir(path.join(scan.root, ...rel.split("/").filter(Boolean)), {
            withFileTypes: true,
          })
            .catch(() => [])
            .then((entries) =>
              entries
                .filter(
                  (e) => e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith("."),
                )
                .map((e) => (rel ? `${rel}/${e.name}` : e.name)),
            );
    scan.listings.set(rel, listing);
  }
  return listing;
}

async function expand(scan: Scan, pattern: string): Promise<string[]> {
  const segments = pattern
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    // Consecutive `**` segments match the same directories as one.
    .filter((s, i, all) => !(s === "**" && all[i - 1] === "**"));
  if (segments.length > MAX_SEGMENTS || segments.some((s) => s === "..")) return [];
  const results = new Set<string>();
  // Smallest `**` depth at which each (directory, segment) state was reached; reaching it again
  // at the same or a greater depth cannot match anything new.
  const visited = new Map<string, number>();
  const walk = async (rel: string, index: number, depth: number): Promise<void> => {
    const key = `${rel}\0${index}`;
    if ((visited.get(key) ?? Infinity) <= depth) return;
    visited.set(key, depth);
    if (index === segments.length) {
      if (rel) results.add(rel);
      return;
    }
    const segment = segments[index]!;
    if (segment === "**") {
      await walk(rel, index + 1, depth);
      if (depth >= MAX_DEPTH) return;
      for (const dir of await subdirectories(scan, rel)) await walk(dir, index, depth + 1);
    } else if (segment.includes("*")) {
      const matcher = new RegExp(
        `^${segment
          .split("*")
          .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join("[^/]*")}$`,
      );
      for (const dir of await subdirectories(scan, rel)) {
        if (matcher.test(path.posix.basename(dir))) await walk(dir, index + 1, depth);
      }
    } else {
      const next = rel ? `${rel}/${segment}` : segment;
      if ((await subdirectories(scan, rel)).includes(next)) await walk(next, index + 1, depth);
    }
  };
  await walk("", 0, 0);
  return [...results];
}

/**
 * Workspace package directories declared by pnpm-workspace.yaml or package.json `workspaces`,
 * relative to `root` with forward slashes. Only declared patterns are expanded.
 */
export async function workspacePackages(root: string): Promise<string[]> {
  const patterns = await declaredPatterns(root);
  const scan: Scan = { root, listings: new Map() };
  const included = new Set<string>();
  const excluded = new Set<string>();
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    for (const dir of await expand(scan, negated ? pattern.slice(1) : pattern)) {
      (negated ? excluded : included).add(dir);
    }
  }
  return [...included].filter((dir) => !excluded.has(dir)).sort();
}
