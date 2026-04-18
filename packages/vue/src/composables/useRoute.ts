import { inject } from "vue";

import { RouteKey } from "../context";

import type { RouteContext } from "../types";
import type { Params } from "@real-router/core";

export const useRoute = <P extends Params = Params>(): RouteContext<P> => {
  const routeContext = inject(RouteKey);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  return routeContext as RouteContext<P>;
};
