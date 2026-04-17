import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { createSelector, onCleanup, onMount } from "solid-js";

import { RouterContext, RouteContext } from "./context";
import { createSignalFromSource } from "./createSignalFromSource";
import { createRouteAnnouncer } from "./dom-utils/index.js";

import type { Router } from "@real-router/core";
import type { ParentProps, JSX } from "solid-js";

export interface RouteProviderProps {
  router: Router;
  announceNavigation?: boolean;
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

export function RouterProvider(
  props: ParentProps<RouteProviderProps>,
): JSX.Element {
  onMount(() => {
    if (!props.announceNavigation) {
      return;
    }

    const announcer = createRouteAnnouncer(props.router);

    onCleanup(() => {
      announcer.destroy();
    });
  });

  const navigator = getNavigator(props.router);
  const routeSource = createRouteSource(props.router);
  const routeSignal = createSignalFromSource(routeSource);

  const routeSelector = createSelector(
    () => routeSignal().route?.name ?? "",
    isRouteActive,
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
