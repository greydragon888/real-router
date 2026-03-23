import { useContext } from "solid-js";

import { RouteContext } from "../context";

import type { RouteState } from "../types";
import type { Accessor } from "solid-js";

export const useRoute = (): Accessor<RouteState> => {
  const routeSignal = useContext(RouteContext);

  if (!routeSignal) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  return routeSignal;
};
