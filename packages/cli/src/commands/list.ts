import { emit } from "../core/output.js";
import { loadPackagedRegistry } from "../core/registry.js";
import { BUNDLED_REGISTRY_DIR } from "../core/runtime.js";

interface ListData {
  items: { id: string; version: string; description: string }[];
  presets: { id: string; description: string; items: string[] }[];
}

export async function list(options: { json: boolean }): Promise<number> {
  const { value, diagnostics } = await loadPackagedRegistry(BUNDLED_REGISTRY_DIR);
  const data: ListData | undefined = value && {
    items: value.index.items.map(({ id, version, description }) => ({ id, version, description })),
    presets: value.index.presets.map(({ id, description, items }) => ({ id, description, items })),
  };
  return emit(
    { command: "list", target: null, diagnostics, ...(data ? { data } : {}) },
    options.json,
    (d) => {
      const width = Math.max(
        ...d.items.map((i) => i.id.length),
        ...d.presets.map((p) => p.id.length),
      );
      const rows = (entries: { id: string; description: string }[]) =>
        entries.map((e) => `  ${e.id.padEnd(width)}  ${e.description}`).join("\n");
      return [
        "Items:",
        rows(d.items.map((i) => ({ id: i.id, description: `${i.description} (v${i.version})` }))),
        "",
        "Presets:",
        rows(d.presets),
      ].join("\n");
    },
  );
}
