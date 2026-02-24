import type { Router } from "../Router";
import type { RoutesApi } from "./types";
import type { DefaultDependencies } from "@real-router/types";

export function getRoutesApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): RoutesApi<Dependencies> {
  return {
    add: (routes, options) => {
      router.addRoute(routes, options);
    },
    remove: (name) => {
      router.removeRoute(name);
    },
    update: (name, updates) => {
      router.updateRoute(name, updates);
    },
    clear: () => {
      router.clearRoutes();
    },
    has: router.hasRoute,
  };
}
