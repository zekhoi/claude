import type { Diagnostic } from "./diagnostics.js";
import { formatDiagnostic, hasErrors } from "./diagnostics.js";
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

/** Writes a command result as one JSON object, or diagnostics to stderr in human mode. */
export function emit<T>(
  result: CommandResult<T>,
  json: boolean,
  human: (data: T) => string,
): number {
  const exitCode = hasErrors(result.diagnostics) ? EXIT_ERROR : EXIT_OK;
  if (json) {
    const payload = {
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      command: result.command,
      status: exitCode === EXIT_OK ? "ok" : "error",
      target: result.target,
      ...(result.data === undefined ? {} : { data: result.data }),
      diagnostics: result.diagnostics,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    for (const d of result.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
    if (result.data !== undefined && exitCode === EXIT_OK) {
      process.stdout.write(`${human(result.data)}\n`);
    }
  }
  return exitCode;
}
