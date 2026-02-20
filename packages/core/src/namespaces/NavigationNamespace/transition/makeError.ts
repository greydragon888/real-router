// packages/real-router/modules/transition/makeError.ts

import { wrapSyncError } from "./wrapSyncError";
import { RouterError } from "../../../RouterError";

// Helper: Creating an error with code
export const makeError = (
  code: string,
  err?: RouterError,
): RouterError | undefined => {
  if (!err) {
    return undefined;
  }

  err.setCode(code);

  return err;
};

/**
 * Re-throws a caught error as a RouterError with the given error code.
 * If the error is already a RouterError, sets the code directly.
 * Otherwise wraps it with wrapSyncError metadata.
 */
export function rethrowAsRouterError(
  error: unknown,
  errorCode: string,
  segment?: string,
): never {
  if (error instanceof RouterError) {
    error.setCode(errorCode);

    throw error;
  }

  throw new RouterError(errorCode, wrapSyncError(error, segment));
}
