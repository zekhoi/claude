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
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Diagnostic {
  code: DiagnosticCode;
  severity: "error" | "warning";
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

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

export function formatDiagnostic(d: Diagnostic): string {
  const location = d.path ? ` (${d.path})` : "";
  const action = d.action ? `\n  → ${d.action}` : "";
  return `${d.severity} ${d.code}${location}: ${d.message}${action}`;
}
