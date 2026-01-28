// packages/real-router/modules/transition/makeError.ts

import type { RouterError } from "../../../RouterError";

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
