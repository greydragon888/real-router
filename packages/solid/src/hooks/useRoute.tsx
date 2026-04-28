import { useContext } from "solid-js";

import { RouteContext } from "../context";

import type { RouteState } from "../types";
import type { Params, State } from "@real-router/core";
import type { Accessor } from "solid-js";

export const useRoute = <P extends Params = Params>(): Accessor<
  Omit<RouteState<P>, "route"> & { route: State<P> }
> => {
  const routeSignal = useContext(RouteContext);

  if (!routeSignal) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  if (!routeSignal().route) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return routeSignal as Accessor<
    Omit<RouteState<P>, "route"> & { route: State<P> }
  >;
};
