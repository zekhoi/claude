import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** Builds the CLI and bundled registry once so integration tests run the real `dist` output. */
export default function setup(): void {
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], { cwd, stdio: "inherit" });
  execFileSync(
    process.execPath,
    ["dist/scripts/build-registry.js", "../../registry", "dist/registry"],
    { cwd, stdio: "inherit" },
  );
}
