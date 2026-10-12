export const BLOCK_START = "<!-- agent-kit:start -->";
export const BLOCK_END = "<!-- agent-kit:end -->";

export type BlockParse =
  | { kind: "none" }
  | { kind: "block"; before: string; body: string; after: string }
  | { kind: "malformed"; reason: string };

/** Finds the single managed block in a file. Markers must occupy whole lines. */
export function parseBlock(text: string): BlockParse {
  const lines = text.split(/(?<=\n)/);
  const starts: number[] = [];
  const ends: number[] = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === BLOCK_START) starts.push(i);
    else if (trimmed === BLOCK_END) ends.push(i);
  });

  if (starts.length === 0 && ends.length === 0) return { kind: "none" };
  if (starts.length !== 1 || ends.length !== 1) {
    return {
      kind: "malformed",
      reason: `expected one start and one end marker, found ${starts.length} and ${ends.length}`,
    };
  }
  const [start, end] = [starts[0]!, ends[0]!];
  if (end < start) return { kind: "malformed", reason: "end marker precedes start marker" };

  // Blank lines at the body's edges are layout, not content: formatters commonly add or remove them.
  const body = lines
    .slice(start + 1, end)
    .join("")
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .replace(/(?:\r?\n[ \t]*)+$/, "")
    .replace(/^[ \t]*$/, "");
  return {
    kind: "block",
    before: lines.slice(0, start).join(""),
    body,
    after: lines.slice(end + 1).join(""),
  };
}

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Blank lines inside the markers match the layout Markdown formatters such as Prettier produce. */
function renderBlock(body: string, eol: string): string {
  return [BLOCK_START, "", ...body.split("\n"), "", BLOCK_END].join(eol) + eol;
}

/**
 * Returns the file content with the managed block set to `body` (LF-separated), preserving all
 * content outside the block and the file's existing line endings. Appends a block when none exists.
 */
export function writeBlock(text: string | undefined, body: string): string {
  if (text === undefined || text === "") return renderBlock(body, "\n");
  const eol = eolOf(text);
  const parsed = parseBlock(text);
  if (parsed.kind === "malformed")
    throw new Error(`cannot write a malformed block: ${parsed.reason}`);
  if (parsed.kind === "block") return parsed.before + renderBlock(body, eol) + parsed.after;

  const separator = text.endsWith("\n") ? eol : eol + eol;
  return text + separator + renderBlock(body, eol);
}
