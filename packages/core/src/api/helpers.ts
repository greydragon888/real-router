// packages/core/src/api/helpers.ts

import { errorCodes } from "../constants";
import { RouterError } from "../RouterError";

export function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}
