/**
 * Errors shown to people or written to logs carry operation names only —
 * never credentials, environment values, or content bodies.
 */
export class ConfigurationError extends Error {
  constructor() {
    super("Ours is missing its browser configuration.");
    this.name = "ConfigurationError";
  }
}

export class MemberMappingError extends Error {
  constructor() {
    super("The signed-in account is not mapped to exactly one Ours member.");
    this.name = "MemberMappingError";
  }
}

export class OperationError extends Error {
  readonly operation: string;
  /** Postgres SQLSTATE when the server reported one (e.g. 23505). Never message text. */
  readonly code: string | null;

  constructor(operation: string, code?: string | null) {
    super(`Ours could not complete ${operation}.`);
    this.name = "OperationError";
    this.operation = operation;
    this.code = code && /^[0-9A-Z]{5}$/.test(code) ? code : null;
  }
}

/** Wraps a Supabase error into a content-free OperationError. */
export function toOperationError(operation: string, error: { code?: string } | null | undefined) {
  return new OperationError(operation, error?.code ?? null);
}

export const isUniqueViolation = (error: unknown) =>
  error instanceof OperationError && error.code === "23505";
