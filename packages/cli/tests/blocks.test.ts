import { describe, expect, it } from "vitest";
import { BLOCK_END, BLOCK_START, parseBlock, writeBlock } from "../src/core/blocks.js";

const block = (body: string) => `${BLOCK_START}\n\n${body}\n\n${BLOCK_END}\n`;

describe("parseBlock", () => {
  it("finds no block in plain text", () => {
    expect(parseBlock("# Title\n")).toEqual({ kind: "none" });
  });

  it("splits content around a single block", () => {
    expect(parseBlock(`before\n${block("a\nb")}after\n`)).toEqual({
      kind: "block",
      before: "before\n",
      body: "a\nb",
      after: "after\n",
    });
  });

  it("ignores blank lines at the body's edges", () => {
    const tight = parseBlock(`${BLOCK_START}\nbody\n${BLOCK_END}\n`);
    const loose = parseBlock(`${BLOCK_START}\n\n  \nbody\n\n${BLOCK_END}\n`);
    expect(tight).toMatchObject({ kind: "block", body: "body" });
    expect(loose).toEqual(tight);
    expect(parseBlock(`${BLOCK_START}\n\n${BLOCK_END}\n`)).toMatchObject({ body: "" });
  });

  it("only treats whole-line markers as markers", () => {
    expect(parseBlock(`See \`${BLOCK_START}\` in docs\n`)).toEqual({ kind: "none" });
  });

  it.each([
    ["two blocks", `${block("a")}${block("b")}`],
    ["a missing end marker", `${BLOCK_START}\nx\n`],
    ["a lone end marker", `x\n${BLOCK_END}\n`],
    ["reversed markers", `${BLOCK_END}\nx\n${BLOCK_START}\n`],
  ])("reports %s as malformed", (_, text) => {
    expect(parseBlock(text).kind).toBe("malformed");
  });
});

describe("writeBlock", () => {
  it("creates a file containing only the block", () => {
    expect(writeBlock(undefined, "x")).toBe(block("x"));
  });

  it("appends after existing content with a blank line", () => {
    expect(writeBlock("# Notes\n", "x")).toBe(`# Notes\n\n${block("x")}`);
    expect(writeBlock("# Notes", "x")).toBe(`# Notes\n\n${block("x")}`);
  });

  it("replaces only the block body and preserves surrounding content", () => {
    const text = `top\n${block("old")}bottom\n`;
    expect(writeBlock(text, "new\nbody")).toBe(`top\n${block("new\nbody")}bottom\n`);
  });

  it("preserves CRLF line endings", () => {
    const text = "top\r\n";
    expect(writeBlock(text, "a\nb")).toBe(
      `top\r\n\r\n${BLOCK_START}\r\n\r\na\r\nb\r\n\r\n${BLOCK_END}\r\n`,
    );
  });

  it("is idempotent", () => {
    const once = writeBlock("top\n", "x");
    expect(writeBlock(once, "x")).toBe(once);
  });
});
