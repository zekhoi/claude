import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GUIDELINES_SKILL, PLUGIN_NAME, renderPlugin } from "../adapters/plugin.js";
import { formatDiagnostic } from "../core/diagnostics.js";
import { loadPackagedRegistry } from "../core/registry.js";

// Generates the Claude Code plugin and the repository's marketplace file from the bundled
// registry. Usage: build-plugin <packaged-registry-dir> <plugin-dir> <marketplace-json>
const [registryArg, pluginArg, marketplaceArg] = process.argv.slice(2);
if (!registryArg || !pluginArg || !marketplaceArg) {
  console.error("usage: build-plugin <packaged-registry-dir> <plugin-dir> <marketplace-json>");
  process.exit(1);
}

const { value: registry, diagnostics } = await loadPackagedRegistry(path.resolve(registryArg));
if (!registry || diagnostics.length > 0) {
  for (const d of diagnostics) console.error(formatDiagnostic(d));
  process.exit(1);
}

const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
  license: string;
  repository: { url: string };
};
const repository = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
const description =
  "Engineering guidelines, skills, rules, and subagents for code review, debugging, feature work, commits, pull requests, security audits, and database design.";

const items = [...registry.index.items].sort((a, b) => a.id.localeCompare(b.id));
const catalogNames = items.flatMap((i) => {
  const name = i.id.slice(i.id.indexOf("/") + 1);
  return i.type === "rule"
    ? [`${name}-rules`]
    : i.type === "skill" || i.type === "agent"
      ? [name]
      : [];
});
const files = items.flatMap((item) => renderPlugin(item, registry.contents, catalogNames));

const skills = files
  .filter((f) => f.path.startsWith("skills/") && f.path.endsWith("/SKILL.md"))
  .map((f) => f.path.split("/")[1]!);
const agents = files
  .filter((f) => f.path.startsWith("agents/"))
  .map((f) => path.basename(f.path, ".md"));

const manifest = {
  name: PLUGIN_NAME,
  version: pkg.version,
  description,
  author: { name: "Khoironi Kurnia Syah", url: "https://github.com/zekhoi" },
  homepage: repository,
  repository,
  license: pkg.license,
  keywords: ["engineering", "code-review", "debugging", "commits", "pull-requests", "security"],
};

const readme = `# ${PLUGIN_NAME}

${description}

This plugin is generated from the [agent-kit](${repository}) catalog. Do not edit it directly.

## Install

\`\`\`text
/plugin marketplace add zekhoi/claude
/plugin install ${PLUGIN_NAME}@${PLUGIN_NAME}
\`\`\`

## Contents

Skills: ${skills.map((s) => `\`${PLUGIN_NAME}:${s}\``).join(", ")}.

Subagents: ${agents.map((a) => `\`${PLUGIN_NAME}:${a}\``).join(", ")}.

Plugins cannot load always-on instructions or path-scoped rules, so the core guidelines are the \`${GUIDELINES_SKILL}\` skill and each rule is a \`*-rules\` skill that names the files it applies to. For guidelines that load in every session, path-scoped rules, update tracking that preserves your edits, or Codex support, install with the CLI instead: \`npx @zekhoi/agent-kit init\`. Use one or the other in a project, not both.
`;

const pluginDir = path.resolve(pluginArg);
await rm(pluginDir, { recursive: true, force: true });
const write = async (rel: string, content: string) => {
  const target = path.join(pluginDir, ...rel.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
};
await write(".claude-plugin/plugin.json", `${JSON.stringify(manifest, null, 2)}\n`);
await write("README.md", readme);
for (const file of files) await write(file.path, file.content);

const marketplace = {
  name: PLUGIN_NAME,
  description: `The ${PLUGIN_NAME} plugin: ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
  owner: manifest.author,
  plugins: [
    {
      name: PLUGIN_NAME,
      source: `./${path
        .relative(path.dirname(path.dirname(path.resolve(marketplaceArg))), pluginDir)
        .split(path.sep)
        .join("/")}`,
      description,
      version: pkg.version,
    },
  ],
};
await mkdir(path.dirname(path.resolve(marketplaceArg)), { recursive: true });
await writeFile(path.resolve(marketplaceArg), `${JSON.stringify(marketplace, null, 2)}\n`);
console.error(`plugin built into ${pluginArg} (${skills.length} skills, ${agents.length} agents)`);
