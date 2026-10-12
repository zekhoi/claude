import path from "node:path";
import { formatDiagnostic, hasErrors } from "../core/diagnostics.js";
import { buildRegistry } from "../core/registry.js";

const [sourceArg, outArg] = process.argv.slice(2);
if (!sourceArg || !outArg) {
  console.error("usage: build-registry <source-registry-dir> <out-dir>");
  process.exit(1);
}

const diagnostics = await buildRegistry(path.resolve(sourceArg), path.resolve(outArg));
for (const d of diagnostics) console.error(formatDiagnostic(d));
if (hasErrors(diagnostics)) {
  console.error("registry build failed");
  process.exit(1);
}
console.error(`registry built into ${outArg}`);
