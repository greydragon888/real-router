import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { createSelector, onCleanup, onMount } from "solid-js";

import { RouterContext, RouteContext } from "./context";
import { createSignalFromSource } from "./createSignalFromSource";
import { createRouteAnnouncer, createScrollRestoration } from "./dom-utils";

import type { ScrollRestorationOptions } from "./dom-utils";
import type { Router } from "@real-router/core";
import type { ParentProps, JSX } from "solid-js";

export interface RouteProviderProps {
  router: Router;
  announceNavigation?: boolean;
  scrollRestoration?: ScrollRestorationOptions;
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

  onMount(() => {
    if (!props.scrollRestoration) {
      return;
    }

    const sr = createScrollRestoration(props.router, props.scrollRestoration);

    onCleanup(() => {
      sr.destroy();
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
