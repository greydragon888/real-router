// packages/core/src/namespaces/NavigationNamespace/transition/errorHandling.ts

import { errorCodes } from "../../../constants";
import { RouterError } from "../../../RouterError";

import type { State } from "../../../types";
import type { NavigationDependencies } from "../types";

export function routeTransitionError(
  deps: NavigationDependencies,
  error: unknown,
  toState: State,
  fromState: State | undefined,
): void {
  const routerError = error as RouterError;

  if (
    routerError.code === errorCodes.TRANSITION_CANCELLED ||
    routerError.code === errorCodes.ROUTE_NOT_FOUND
  ) {
    return;
  }

  deps.sendTransitionFail(toState, fromState, routerError);
}

export function handleGuardError(
  error: unknown,
  errorCode: string,
  segment: string,
): never {
  if (error instanceof DOMException && error.name === "AbortError") {
    throw new RouterError(errorCodes.TRANSITION_CANCELLED);
  }

  // A guard can also signal a quiet cancel by throwing
  // RouterError(TRANSITION_CANCELLED) directly — the same intent as a thrown
  // AbortError. Preserve it as-is instead of letting rethrowAsRouterError
  // overwrite the code with CANNOT_ACTIVATE / CANNOT_DEACTIVATE: that code
  // drives the downstream suppression (routeTransitionError early-returns,
  // fire-and-forget stays silent), so re-coding would surface the intended
  // quiet cancel as a reported transition error (#933).
  if (
    error instanceof RouterError &&
    error.code === errorCodes.TRANSITION_CANCELLED
  ) {
    throw error;
  }

  rethrowAsRouterError(error, errorCode, segment);
}

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

// Own-enumerable keys that must never be copied from a thrown object onto the
// RouterError metadata:
// - `code` / `segment` / `path` are reserved — the RouterError constructor
//   throws a TypeError on them (#39).
// - `then` would make the RouterError itself thenable, so a consumer that
//   awaits it (or passes it through Promise.resolve / returns it from an async
//   function) would have it assimilated as a Promise instead of treated as a
//   plain rejection reason (#947).
const reservedRouterErrorProps = new Set(["code", "segment", "path", "then"]);

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
      // Skip reserved / hazardous keys: #39 (constructor TypeError on code/
      // segment/path) and #947 (`then` would make the error thenable).
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
