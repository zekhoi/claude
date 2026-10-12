export const DIAGNOSTIC_CODES = [
  "UNSUPPORTED_RUNTIME",
  "UNSUPPORTED_SCHEMA",
  "SCHEMA_INVALID",
  "DUPLICATE_ID",
  "ID_TYPE_MISMATCH",
  "MISSING_SOURCE",
  "UNSAFE_PATH",
  "INVALID_ENCODING",
  "DESTINATION_NOT_ALLOWED",
  "DESTINATION_COLLISION",
  "UNSUPPORTED_DEPENDENCIES",
  "UNKNOWN_PRESET_ITEM",
  "INVALID_FRONTMATTER",
  "CHECKSUM_MISMATCH",
  "UNKNOWN_ITEM",
  "INPUT_REQUIRED",
  "TARGET_INVALID",
  "MANIFEST_INVALID",
  "LOCK_HELD",
  "LOCAL_EDIT_CONFLICT",
  "UNMANAGED_FILE_CONFLICT",
  "MALFORMED_BLOCK",
  "OUTDATED_ITEM",
  "TARGET_CHANGED",
  "WRITE_FAILED",
  "UPDATE_AVAILABLE",
  "MAJOR_UPDATE",
  "NOT_INSTALLED",
  "MISSING_FILE",
  "ITEM_RETIRED",
  "IMPORT_MISSING",
  "NAME_COLLISION",
  "LEFTOVER_FILE",
  "CONTEXT_MISSING",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Diagnostic {
  code: DiagnosticCode;
  /** `conflict` requires user action and exits with 2; `error` exits with 1. */
  severity: "error" | "conflict" | "warning";
  message: string;
  /** Path relative to the registry root or target root, using forward slashes. */
  path?: string;
  /** A concrete next step for the user or maintainer. */
  action?: string;
}

export function error(
  code: DiagnosticCode,
  message: string,
  extra: { path?: string; action?: string } = {},
): Diagnostic {
  return { code, severity: "error", message, ...extra };
}

export function conflict(
  code: DiagnosticCode,
  message: string,
  extra: { path?: string; action?: string } = {},
): Diagnostic {
  return { code, severity: "conflict", message, ...extra };
}

export function warning(
  code: DiagnosticCode,
  message: string,
  extra: { path?: string; action?: string } = {},
): Diagnostic {
  return { code, severity: "warning", message, ...extra };
}

export function hasConflicts(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "conflict");
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

export function formatDiagnostic(d: Diagnostic): string {
  const location = d.path ? ` (${d.path})` : "";
  const action = d.action ? `\n  → ${d.action}` : "";
  return `${d.severity} ${d.code}${location}: ${d.message}${action}`;
}
