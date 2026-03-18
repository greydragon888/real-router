import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";

import { RouterContext, RouteContext } from "./context";
import { createSignalFromSource } from "./createSignalFromSource";

import type { Router } from "@real-router/core";
import type { ParentProps, JSX } from "solid-js";

export interface RouteProviderProps {
  router: Router;
}

export function RouterProvider(
  props: ParentProps<RouteProviderProps>,
): JSX.Element {
  const navigator = getNavigator(props.router);
  const routeSource = createRouteSource(props.router);
  const routeSignal = createSignalFromSource(routeSource);

  return (
    <RouterContext.Provider value={{ router: props.router, navigator }}>
      <RouteContext.Provider value={routeSignal}>
        {props.children}
      </RouteContext.Provider>
    </RouterContext.Provider>
  );
}
