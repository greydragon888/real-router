import { NavigatorKey, RouteKey, RouterKey } from "./context";
import { pushDirectiveRouter } from "./directives/vLink";
import { setupRouteProvision } from "./setupRouteProvision";

import type { Router } from "@real-router/core";
import type { App, Plugin } from "vue";

export function createRouterPlugin(router: Router): Plugin<[]> {
  return {
    install(app): void {
      const releaseDirective = pushDirectiveRouter(router);

      const { navigator, route, previousRoute, unsubscribe } =
        setupRouteProvision(router);

      // Vue 3.5+ exposes app.onUnmount for plugin cleanup.
      // On older versions (3.3–3.4), the subscription is cleaned up
      // when the router is garbage-collected (same as vue-router).
      if ("onUnmount" in app) {
        (app as App & { onUnmount: (fn: () => void) => void }).onUnmount(() => {
          releaseDirective();
          unsubscribe();
        });
      }

      app.provide(RouterKey, router);
      app.provide(NavigatorKey, navigator);
      app.provide(RouteKey, { navigator, route, previousRoute });
    },
  };
}
