import { inject } from "vue";

import { RouteKey } from "../context";

import type { RouteContext } from "../types";
import type { Params, State } from "@real-router/core";
import type { Ref } from "vue";

export const useRoute = <P extends Params = Params>(): Omit<
  RouteContext<P>,
  "route"
> & { route: Readonly<Ref<State<P>>> } => {
  const routeContext = inject(RouteKey);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  if (!routeContext.route.value) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return routeContext as Omit<RouteContext<P>, "route"> & {
    route: Readonly<Ref<State<P>>>;
  };
};
