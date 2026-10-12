import { normalizeContent } from "./content.js";

/** Above this many line pairs the LCS table gets expensive; fall back to a whole-file replacement. */
const MAX_CELLS = 4_000_000;

type Op = { kind: " " | "-" | "+"; line: string };

function lines(text: string): string[] {
  const normalized = normalizeContent(text);
  return normalized === "" ? [] : normalized.split("\n");
}

/** Line-level edit script from a longest-common-subsequence table. */
function editScript(a: readonly string[], b: readonly string[]): Op[] {
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((line) => ({ kind: "-" as const, line })),
      ...b.map((line) => ({ kind: "+" as const, line })),
    ];
  }
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: " ", line: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ kind: "-", line: a[i++]! });
    } else {
      ops.push({ kind: "+", line: b[j++]! });
    }
  }
  while (i < a.length) ops.push({ kind: "-", line: a[i++]! });
  while (j < b.length) ops.push({ kind: "+", line: b[j++]! });
  return ops;
}

/**
 * Unified diff between two texts after line-ending normalization, so line-ending conversion never
 * shows up as a change. Returns an empty string when the texts are equivalent.
 */
export function unifiedDiff(
  before: string,
  after: string,
  labels: { from: string; to: string },
  context = 3,
): string {
  const a = lines(before);
  const b = lines(after);
  const ops = editScript(a, b);
  if (ops.every((op) => op.kind === " ")) return "";

  // Group changes into hunks, merging those separated by at most 2 * context unchanged lines.
  const changed = ops.flatMap((op, index) => (op.kind === " " ? [] : [index]));
  const hunks: [number, number][] = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    const last = hunks.at(-1);
    if (last && start <= last[1]) last[1] = end;
    else hunks.push([start, end]);
  }

  const out = [`--- ${labels.from}`, `+++ ${labels.to}`];
  for (const [start, end] of hunks) {
    let oldLine = 1;
    let newLine = 1;
    for (const op of ops.slice(0, start)) {
      if (op.kind !== "+") oldLine++;
      if (op.kind !== "-") newLine++;
    }
    const slice = ops.slice(start, end);
    const oldCount = slice.filter((op) => op.kind !== "+").length;
    const newCount = slice.filter((op) => op.kind !== "-").length;
    const range = (line: number, count: number) =>
      `${count === 0 ? line - 1 : line}${count === 1 ? "" : `,${count}`}`;
    out.push(`@@ -${range(oldLine, oldCount)} +${range(newLine, newCount)} @@`);
    for (const op of slice) out.push(`${op.kind}${op.line}`);
  }
  return out.join("\n");
}
