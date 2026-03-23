import { getContext } from "svelte";

import { ROUTE_KEY } from "../context";

import type { RouteContext } from "../types";

export const useRoute = (): RouteContext => {
  const routeContext = getContext<RouteContext | undefined>(ROUTE_KEY);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  return routeContext;
};
