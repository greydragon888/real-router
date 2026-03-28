import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { shallowRef } from "vue";

import { NavigatorKey, RouteKey, RouterKey } from "./context";
import { setDirectiveRouter } from "./directives/vLink";

import type { Router } from "@real-router/core";
import type { Plugin } from "vue";

export function createRouterPlugin(router: Router): Plugin<[]> {
  return {
    install(app): void {
      const navigator = getNavigator(router);

      setDirectiveRouter(router);

      const source = createRouteSource(router);
      const initialSnapshot = source.getSnapshot();

      const route = shallowRef(initialSnapshot.route);
      const previousRoute = shallowRef(initialSnapshot.previousRoute);

      source.subscribe(() => {
        const snapshot = source.getSnapshot();

        route.value = snapshot.route;
        previousRoute.value = snapshot.previousRoute;
      });

      app.provide(RouterKey, router);
      app.provide(NavigatorKey, navigator);
      app.provide(RouteKey, { navigator, route, previousRoute });
    },
  };
}
