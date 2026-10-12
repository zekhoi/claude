import { createHash } from "node:crypto";

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Normalizes text for comparison and hashing: strips a leading BOM, converts CRLF and CR to LF,
 * and ignores a single trailing newline. Line-ending conversion alone must never cause a conflict.
 */
export function normalizeContent(text: string): string {
  let s = text.startsWith("﻿") ? text.slice(1) : text;
  s = s.replace(/\r\n?/g, "\n");
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeContent(text), "utf8").digest("hex");
}

/** Decodes registry or target file bytes as strict UTF-8; returns undefined for invalid input. */
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return decoder.decode(bytes);
  } catch {
    return undefined;
  }
}
