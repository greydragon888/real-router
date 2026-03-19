import { inject } from "vue";

import { RouteKey } from "../context";

import type { RouteContext } from "../types";

export const useRoute = (): RouteContext => {
  const routeContext = inject(RouteKey);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  return routeContext;
};
