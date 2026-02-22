import { RouterError } from "../../../RouterError";

/**
 * Error metadata structure for transition errors.
 * Contains information extracted from caught exceptions.
 */
export interface SyncErrorMetadata {
  [key: string]: unknown;
  message?: string;
  stack?: string | undefined;
  cause?: unknown;
  segment?: string;
}

/**
 * Re-throws a caught error as a RouterError with the given error code.
 * If the error is already a RouterError, sets the code directly.
 * Otherwise wraps it with wrapSyncError metadata.
 */
export function rethrowAsRouterError(
  error: unknown,
  errorCode: string,
  segment: string,
): never {
  if (error instanceof RouterError) {
    error.setCode(errorCode);

    throw error;
  }

  throw new RouterError(errorCode, wrapSyncError(error, segment));
}

const reservedRouterErrorProps = new Set([
  "code",
  "segment",
  "path",
  "redirect",
]);

/**
 * Wraps a synchronously thrown value into structured error metadata.
 *
 * This helper extracts useful debugging information from various thrown values:
 * - Error instances: extracts message, stack, and cause (ES2022+)
 * - Plain objects: spreads properties into metadata
 * - Primitives (string, number, etc.): returns minimal metadata
 *
 * @param thrown - The value caught in a try-catch block
 * @param segment - Route segment name (for lifecycle hooks)
 * @returns Structured error metadata for RouterError
 */
export function wrapSyncError(
  thrown: unknown,
  segment: string,
): SyncErrorMetadata {
  const base: SyncErrorMetadata = { segment };

  // Handle Error instances - extract all useful properties
  if (thrown instanceof Error) {
    return {
      ...base,
      message: thrown.message,
      stack: thrown.stack,
      // Error.cause requires ES2022+ - safely access if present
      ...("cause" in thrown &&
        thrown.cause !== undefined && { cause: thrown.cause }),
    };
  }

  // Handle plain objects - spread properties into metadata, filtering reserved props
  if (thrown && typeof thrown === "object") {
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(thrown)) {
      // Issue #39: Skip reserved properties to avoid RouterError constructor TypeError
      if (!reservedRouterErrorProps.has(key)) {
        filtered[key] = value;
      }
    }

    return { ...base, ...filtered };
  }

  // Primitives (string, number, boolean, null, undefined, symbol, bigint)
  // Return base metadata only - the primitive value isn't useful as metadata
  return base;
}
