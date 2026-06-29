// packages/core/src/api/helpers.ts

import { errorCodes } from "../constants";
import { RouterError } from "../RouterError";

export function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

/**
 * Bans synchronous reentrant route-CRUD: a CRUD op called while a `TREE_CHANGED`
 * emit is on the stack (i.e. from inside a `subscribeChanges` handler) throws
 * `REENTRANT_TREE_MUTATION` BEFORE mutating — the tree stays atomic (#1032).
 * Deferred CRUD (`queueMicrotask` / `await`) runs after the dispatch settles and
 * is unaffected; CRUD from a transition listener is not a TREE_CHANGED dispatch.
 */
export function throwIfReentrantTreeMutation(isEmitting: () => boolean): void {
  if (isEmitting()) {
    throw new RouterError(errorCodes.REENTRANT_TREE_MUTATION);
  }
}
