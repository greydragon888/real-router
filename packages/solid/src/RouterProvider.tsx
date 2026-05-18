import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { createSelector, onCleanup, onMount } from "solid-js";

import { RouterContext, RouteContext } from "./context";
import { createSignalFromSource } from "./createSignalFromSource";
import {
  createRouteAnnouncer,
  createScrollRestoration,
  createViewTransitions,
} from "./dom-utils";

import type { ScrollRestorationOptions } from "./dom-utils";
import type { Router } from "@real-router/core";
import type { ParentProps, JSX } from "solid-js";

export interface RouteProviderProps {
  router: Router;
  announceNavigation?: boolean;
  scrollRestoration?: ScrollRestorationOptions;
  viewTransitions?: boolean;
}

export function isRouteActive(
  linkRouteName: string,
  currentRouteName: string,
): boolean {
  return (
    currentRouteName === linkRouteName ||
    currentRouteName.startsWith(`${linkRouteName}.`)
  );
}

// §8.1 audit fix (LOW) — collapse three identical onMount lifecycle blocks
// into a single helper. Each opt-in feature has the same shape:
//   `if (!enabled) return; const handle = create(...); onCleanup(handle.destroy)`.
// Routing setup through this helper keeps the props.<feature> check + mount
// side-effect + cleanup wiring in one place.
function mountFeature(
  enabled: unknown,
  factory: () => { destroy: () => void },
): void {
  onMount(() => {
    if (!enabled) {
      return;
    }

    const handle = factory();

    onCleanup(() => {
      handle.destroy();
    });
  });
}

export function RouterProvider(
  props: ParentProps<RouteProviderProps>,
): JSX.Element {
  // Setup vars FIRST (§8.1 audit fix LOW #2 — semantic ordering): the router
  // subscription wiring is the core of the provider, the opt-in features
  // below ride on top of it.
  const navigator = getNavigator(props.router);
  const routeSource = createRouteSource(props.router);
  const routeSignal = createSignalFromSource(routeSource);

  const routeSelector = createSelector(
    // The empty-string sentinel guarantees no Link is "active" while the
    // router has no route (unstarted / stopped) — `isRouteActive` short-
    // circuits because no real route name equals or starts with `""` +
    // dot boundary. Without the sentinel, `routeSignal().route?.name`
    // would be `undefined` and the selector would compare against
    // `undefined`, defeating Solid's identity-based change detection.
    () => routeSignal().route?.name ?? "",
    isRouteActive,
  );

  // Opt-in features wired through the shared mountFeature helper.
  mountFeature(props.announceNavigation, () =>
    createRouteAnnouncer(props.router),
  );
  mountFeature(props.scrollRestoration, () =>
    createScrollRestoration(props.router, props.scrollRestoration),
  );
  mountFeature(props.viewTransitions, () =>
    createViewTransitions(props.router),
  );

  return (
    <RouterContext.Provider
      value={{ router: props.router, navigator, routeSelector }}
    >
      <RouteContext.Provider value={routeSignal}>
        {props.children}
      </RouteContext.Provider>
    </RouterContext.Provider>
  );
}
