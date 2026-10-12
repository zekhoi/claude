#!/usr/bin/env node
import { isSupportedNode, MIN_NODE } from "./core/runtime.js";

if (!isSupportedNode(process.versions.node)) {
  console.error(
    `error UNSUPPORTED_RUNTIME: agent-kit requires Node.js >= ${MIN_NODE.join(".")} (found ${process.versions.node})\n` +
      "  → Install a supported Node.js LTS release and rerun the command",
  );
  process.exit(1);
}

const { run } = await import("./cli.js");
process.exitCode = await run(process.argv);
