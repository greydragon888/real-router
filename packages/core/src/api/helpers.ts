// packages/core/src/api/helpers.ts

import { errorCodes } from "../constants";
import { RouterError } from "../RouterError";

export function throwIfDisposed(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new RouterError(errorCodes.ROUTER_DISPOSED);
  }
}

/**
 * Bans synchronous reentrant tree mutation: a mutator called while a
 * `TREE_CHANGED` emit is on the stack (i.e. from inside a `subscribeChanges`
 * handler) throws `REENTRANT_TREE_MUTATION` BEFORE mutating — the tree stays
 * atomic (#1032). Six callers, not five: the `getRoutesApi` mutators and
 * `getPluginApi.setRootPath` (#1751), which rebuilds tree and matcher alike.
 * Deferred CRUD (`queueMicrotask` / `await`) runs after the dispatch settles and
 * is unaffected; CRUD from a transition listener is not a TREE_CHANGED dispatch.
 *
 * ⚑ The remedy rides the ERROR, not this docblock (#1665). It used to live only
 * here — visible to whoever maintains core, not to the application developer
 * who caught the throw — and the same omission on the navigation ban produced
 * two docs issues before anyone reached the code.
 */
export function throwIfReentrantTreeMutation(isEmitting: () => boolean): void {
  if (isEmitting()) {
    throw new RouterError(errorCodes.REENTRANT_TREE_MUTATION, {
      message:
        "[router] cannot mutate the route tree from inside a subscribeChanges handler — the mutation would run while a TREE_CHANGED emit is on the stack and the tree must stay atomic. Defer it: queueMicrotask(() => routes.add(...)) or await.",
    });
  }
}
