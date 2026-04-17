// packages/vue/src/setupRouteProvision.ts

import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { shallowRef } from "vue";

import type { Router, Navigator, State } from "@real-router/core";
import type { ShallowRef } from "vue";

/**
 * Shared setup for `RouterProvider` (component-scoped) and
 * `createRouterPlugin` (app-scoped). Builds the reactive route refs +
 * subscription bookkeeping in one place; callers wire the result into their
 * provide/inject mechanism and own teardown lifecycle.
 *
 * @internal
 */
export interface RouteProvision {
  navigator: Navigator;
  route: ShallowRef<State | undefined>;
  previousRoute: ShallowRef<State | undefined>;
  /** Call when the owning scope tears down to release the router subscription. */
  unsubscribe: () => void;
}

export function setupRouteProvision(router: Router): RouteProvision {
  const navigator = getNavigator(router);
  const source = createRouteSource(router);
  const initial = source.getSnapshot();

  const route = shallowRef<State | undefined>(initial.route);
  const previousRoute = shallowRef<State | undefined>(initial.previousRoute);

  const unsubscribe = source.subscribe(() => {
    const snapshot = source.getSnapshot();

    route.value = snapshot.route;
    previousRoute.value = snapshot.previousRoute;
  });

  return { navigator, route, previousRoute, unsubscribe };
}
