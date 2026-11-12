import { stabilizeState } from "./stabilizeState.js";

import type { RouteNodeSnapshot } from "./types.js";
import type { Router, State, SubscribeState } from "@real-router/core";

export function computeSnapshot(
  currentSnapshot: RouteNodeSnapshot,
  router: Router,
  nodeName: string,
  next?: SubscribeState,
): RouteNodeSnapshot {
  const route = nodeRoute(next?.route ?? router.getState(), nodeName);
  const previousRoute = next?.previousRoute;

  if (
    route === currentSnapshot.route &&
    previousRoute === currentSnapshot.previousRoute
  ) {
    return currentSnapshot;
  }

  const newRoute = stabilizeState(currentSnapshot.route, route);
  const newPreviousRoute = stabilizeState(
    currentSnapshot.previousRoute,
    previousRoute,
  );

  if (
    newRoute === currentSnapshot.route &&
    newPreviousRoute === currentSnapshot.previousRoute
  ) {
    return currentSnapshot;
  }

  return { route: newRoute, previousRoute: newPreviousRoute };
}

/**
 * The route a source scoped to `nodeName` shows while the router is on
 * `state`: `state` itself when the node is active — the root `""` always is —
 * otherwise `undefined`.
 */
export function nodeRoute(
  state: State | undefined,
  nodeName: string,
): State | undefined {
  if (nodeName === "") {
    return state;
  }

  const name = state?.name;

  return name !== undefined &&
    (name === nodeName || name.startsWith(`${nodeName}.`))
    ? state
    : undefined;
}

/**
 * Catch-up of a snapshot to a router state it was not computed against.
 *
 * The route becomes `route` itself, not stabilized: a state the router made
 * while the source was not listening carries that navigation's `context`. And
 * `previousRoute` becomes `undefined`: the route before a navigation the source
 * did not take is not recoverable outside a subscribe payload. Returns
 * `current` itself when that is what it holds.
 */
export function catchUpSnapshot(
  current: RouteNodeSnapshot,
  route: State | undefined,
): RouteNodeSnapshot {
  return route === current.route && current.previousRoute === undefined
    ? current
    : { route, previousRoute: undefined };
}
