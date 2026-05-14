import { ROUTE_KEY, getContextOrThrow } from "../context";

import type { RouteContext } from "../types";
import type { Params, State } from "@real-router/core";

/**
 * `useRoute()`'s return type: same shape as `RouteContext<P>` but with
 * `route.current` narrowed to non-nullable `State<P>` (the composable's
 * `if (!ctx.route.current) throw` guard makes this safe).
 */
type ActiveRouteContext<P extends Params> = Omit<RouteContext<P>, "route"> & {
  route: { readonly current: State<P> };
};

export const useRoute = <P extends Params = Params>(): ActiveRouteContext<P> => {
  const ctx = getContextOrThrow<RouteContext>(ROUTE_KEY, "useRoute");

  if (!ctx.route.current) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return ctx as ActiveRouteContext<P>;
};
