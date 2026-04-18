import { useContext } from "solid-js";

import { RouteContext } from "../context";

import type { RouteState } from "../types";
import type { Params } from "@real-router/core";
import type { Accessor } from "solid-js";

export const useRoute = <P extends Params = Params>(): Accessor<
  RouteState<P>
> => {
  const routeSignal = useContext(RouteContext);

  if (!routeSignal) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  return routeSignal as Accessor<RouteState<P>>;
};
