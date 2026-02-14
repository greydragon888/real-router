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
 * If the error is already a RouterError, sets the code via makeError.
 * Otherwise wraps it with wrapSyncError metadata.
 */
export function rethrowAsRouterError(
  error: unknown,
  errorCode: string,
  segment?: string,
): never {
  if (error instanceof RouterError) {
    const err = makeError(errorCode, error);

    /* v8 ignore next 3 -- @preserve: makeError always returns when err is RouterError */
    if (err) {
      throw err;
    }
  }

  throw new RouterError(errorCode, wrapSyncError(error, segment));
}
