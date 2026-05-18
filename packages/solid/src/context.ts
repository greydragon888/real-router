import { createContext, useContext } from "solid-js";

import type { RouteState } from "./types";
import type { Router, Navigator } from "@real-router/core";
import type { Accessor } from "solid-js";

export interface RouterContextValue {
  router: Router;
  navigator: Navigator;
  routeSelector: (routeName: string) => boolean;
}

export const RouterContext = createContext<RouterContextValue | null>(null);

export const RouteContext = createContext<Accessor<RouteState> | null>(null);

/**
 * Read the required RouterContext or throw a labelled error. Internal helper
 * — consolidates 4 copies of the same `useContext + null-check + throw`
 * block across the public hooks/components/directives. The `consumerName`
 * parameter keeps each callsite's error message specific (so the consumer
 * sees "useRouter must be used within a RouterProvider", not a generic
 * "context missing" message).
 */
export function useRequiredRouterContext(
  consumerName: string,
): RouterContextValue {
  const ctx = useContext(RouterContext);

  if (!ctx) {
    throw new Error(`${consumerName} must be used within a RouterProvider`);
  }

  return ctx;
}
