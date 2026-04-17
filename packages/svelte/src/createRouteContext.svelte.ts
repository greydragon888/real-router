import type { Navigator, State } from "@real-router/core";

import type { RouteContext } from "./types";

export interface RouteSnapshot {
  readonly route: State | undefined;
  readonly previousRoute: State | undefined;
}

export function createRouteContext(
  navigator: Navigator,
  reactive: { readonly current: RouteSnapshot },
): RouteContext {
  const route = {
    get current(): State | undefined {
      return reactive.current.route;
    },
  };

  const previousRoute = {
    get current(): State | undefined {
      return reactive.current.previousRoute;
    },
  };

  return { navigator, route, previousRoute };
}
