import { ROUTE_KEY, getContextOrThrow } from "../context";

import type { RouteContext } from "../types";
import type { Params, State } from "@real-router/core";

export const useRoute = <P extends Params = Params>(): Omit<
  RouteContext<P>,
  "route"
> & { route: { readonly current: State<P> } } => {
  const ctx = getContextOrThrow<RouteContext>(ROUTE_KEY, "useRoute");

  if (!ctx.route.current) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return ctx as Omit<RouteContext<P>, "route"> & {
    route: { readonly current: State<P> };
  };
};
