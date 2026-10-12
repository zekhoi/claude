import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Minimum supported Node.js version; keep in sync with `engines` in package.json. */
export const MIN_NODE = [22, 12, 0] as const;

export function isSupportedNode(version: string): boolean {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < MIN_NODE.length; i++) {
    const have = parts[i] ?? 0;
    const need = MIN_NODE[i] ?? 0;
    if (have !== need) return have > need;
  }
  return true;
}

/** Directory of the registry bundled next to the compiled CLI (`dist/registry`). */
export const BUNDLED_REGISTRY_DIR = fileURLToPath(new URL("../registry", import.meta.url));

export const CLI_VERSION: string = (
  JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
