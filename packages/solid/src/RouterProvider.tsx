import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { createSelector } from "solid-js";

import { RouterContext, RouteContext } from "./context";
import { createSignalFromSource } from "./createSignalFromSource";

import type { Router } from "@real-router/core";
import type { ParentProps, JSX } from "solid-js";

export interface RouteProviderProps {
  router: Router;
}

function isRouteActive(
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
