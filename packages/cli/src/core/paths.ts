/**
 * Returns true for a relative, forward-slash path that stays inside its root: no absolute or
 * drive-letter prefixes, backslashes, empty, `.` or `..` segments, or control characters.
 */
export function isSafeRelativePath(p: string): boolean {
  if (p.length === 0 || p.length > 255) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(p)) return false;
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** Key for detecting collisions on case-insensitive filesystems (macOS, Windows defaults). */
export function collisionKey(p: string): string {
  return p.normalize("NFC").toLowerCase();
}
