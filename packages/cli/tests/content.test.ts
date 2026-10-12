import { describe, expect, it } from "vitest";
import { contentHash, decodeUtf8, normalizeContent } from "../src/core/content.js";

describe("normalizeContent", () => {
  it("treats CRLF, CR, and LF line endings as equal", () => {
    expect(normalizeContent("a\r\nb\r\n")).toBe(normalizeContent("a\nb\n"));
    expect(normalizeContent("a\rb")).toBe("a\nb");
  });

  it("ignores a single trailing newline and a leading BOM", () => {
    expect(normalizeContent("a\n")).toBe("a");
    expect(normalizeContent("\uFEFFa")).toBe("a");
  });

  it("preserves additional trailing newlines and inner whitespace", () => {
    expect(normalizeContent("a\n\n")).toBe("a\n");
    expect(normalizeContent(" a \n")).toBe(" a ");
  });
});

describe("contentHash", () => {
  it("is stable across line-ending conversion", () => {
    expect(contentHash("x\r\ny\r\n")).toBe(contentHash("x\ny"));
  });

  it("changes when content changes", () => {
    expect(contentHash("x")).not.toBe(contentHash("y"));
  });
});

describe("decodeUtf8", () => {
  it("rejects invalid UTF-8", () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0x00]))).toBeUndefined();
    expect(decodeUtf8(new TextEncoder().encode("ok"))).toBe("ok");
  });
});
