import path from "node:path";
import { error } from "../core/diagnostics.js";
import { emit } from "../core/output.js";
import { loadPackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR } from "../core/runtime.js";

interface ShowFile {
  destination: string;
  packagedPath: string;
  sha256: string;
  content?: string;
}

interface ShowData {
  id: string;
  version: string;
  description: string;
  files: ShowFile[];
}

/** Prints an item's bundled files so users can compare or restore them by hand. */
export async function show(id: string, options: { json: boolean; file?: string }): Promise<number> {
  const done = (diagnostics: Parameters<typeof emit>[0]["diagnostics"], data?: ShowData) =>
    emit(
      { command: "show", target: null, diagnostics, ...(data ? { data } : {}) },
      options.json,
      (d) =>
        options.file !== undefined
          ? (d.files[0]?.content ?? "").replace(/\n$/, "")
          : [
              `${d.id}@${d.version}  ${d.description}`,
              ...d.files.map((f) => `  ${f.destination}\n    bundled at ${f.packagedPath}`),
            ].join("\n"),
    );

  const loaded = await loadPackagedRegistry(BUNDLED_REGISTRY_DIR);
  if (!loaded.value || loaded.diagnostics.length > 0) return done(loaded.diagnostics);
  const { index, contents, root } = loaded.value;

  const item = index.items.find((i) => i.id === id);
  if (!item) {
    return done([
      error("UNKNOWN_ITEM", `${id} is not in the catalog bundled with this CLI`, {
        action: "Run `agent-kit list` to see available items",
      }),
    ]);
  }
  const selected =
    options.file === undefined
      ? item.files
      : item.files.filter((f) => f.destination === options.file);
  if (selected.length === 0) {
    return done([
      error("UNKNOWN_ITEM", `${id} has no file with destination ${options.file}`, {
        action: `Use one of: ${item.files.map((f) => f.destination).join(", ")}`,
      }),
    ]);
  }
  return done([], {
    id: item.id,
    version: item.version,
    description: item.description,
    files: selected.map((f) => ({
      destination: f.destination,
      packagedPath: path.join(root, ...f.source.split("/")),
      sha256: f.sha256,
      ...(options.file !== undefined || options.json ? { content: contents.get(f.source)! } : {}),
    })),
  });
}
