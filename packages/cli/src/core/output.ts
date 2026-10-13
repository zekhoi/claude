import type { Diagnostic } from "./diagnostics.js";
import { formatDiagnostic, hasConflicts, hasErrors } from "./diagnostics.js";
import { OUTPUT_SCHEMA_VERSION } from "./schemas.js";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_CONFLICT = 2;

export interface CommandResult<T> {
  command: string;
  target: string | null;
  data?: T;
  diagnostics: Diagnostic[];
}

export function exitCodeFor(diagnostics: readonly Diagnostic[]): number {
  if (hasErrors(diagnostics)) return EXIT_ERROR;
  return hasConflicts(diagnostics) ? EXIT_CONFLICT : EXIT_OK;
}

const STATUS = { [EXIT_OK]: "ok", [EXIT_ERROR]: "error", [EXIT_CONFLICT]: "conflict" } as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Escapes terminal control characters (C0 except newline and tab, DEL, and C1) so text from an
 * untrusted manifest or file cannot rewrite the terminal, hide lines, or change its title.
 */
export function escapeControls(text: string): string {
  return text.replace(
    CONTROL_CHARACTERS,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Writes a command result. JSON mode emits exactly one object on stdout. Human mode writes the
 * rendered data to stdout and diagnostics to stderr.
 */
export function emit<T>(
  result: CommandResult<T>,
  json: boolean,
  human: (data: T) => string,
  options: { raw?: boolean } = {},
): number {
  const exitCode = exitCodeFor(result.diagnostics);
  if (json) {
    const payload = {
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      command: result.command,
      status: STATUS[exitCode as keyof typeof STATUS],
      target: result.target,
      ...(result.data === undefined ? {} : { data: result.data }),
      diagnostics: result.diagnostics,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return exitCode;
  }
  if (result.data !== undefined) {
    const text = human(result.data);
    // `raw` is for exact file content meant for redirection (show --file), from the trusted bundle.
    if (text) process.stdout.write(`${options.raw ? text : escapeControls(text)}\n`);
  }
  for (const d of result.diagnostics) {
    process.stderr.write(`${escapeControls(formatDiagnostic(d))}\n`);
  }
  return exitCode;
}
