// packages/core/src/namespaces/RouterLifecycleNamespace/helpers.ts

import { isState } from "type-guards";

import { noop } from "./constants";

import type { StartRouterArguments } from "./types";
import type { Router } from "../../Router";
import type { DefaultDependencies, DoneFn, State } from "@real-router/types";

/**
 * Parses start() arguments into a normalized tuple.
 */
export const getStartRouterArguments = (
  args: StartRouterArguments,
): [startPathOrState: string | State | undefined, done: DoneFn] => {
  const [first, second] = args;

  if (!first) {
    return [undefined, noop];
  }
  if (typeof first === "function") {
    return [undefined, first];
  }

  return [first, second ?? noop];
};

/**
 * Resolves a path or state to a valid State object.
 */
export const resolveStartState = <Dependencies extends DefaultDependencies>(
  pathOrState: string | State,
  router: Router<Dependencies>,
): State | undefined => {
  if (typeof pathOrState === "string") {
    return router.matchPath(pathOrState);
  }

  // Validate state object structure using isState type guard
  // This validates: name (non-empty string), path (string), params (plain object)
  // Rejects: missing fields, wrong types, functions, symbols, class instances
  if (!isState(pathOrState)) {
    return undefined;
  }

  // Validate that the route exists
  // buildPath throws RouteNotFoundError for invalid routes, so we wrap in try-catch
  // to gracefully return undefined instead of propagating the error
  // See: https://github.com/greydragon888/real-router/issues/42
  try {
    router.buildPath(pathOrState.name, pathOrState.params);
  } catch {
    return undefined;
  }

  return pathOrState;
};
