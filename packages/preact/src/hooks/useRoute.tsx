import { useContext } from "preact/hooks";

import { RouteContext } from "../context";

import type { RouteContext as RouteContextType } from "../types";

export const useRoute = (): RouteContextType => {
  const routeContext = useContext(RouteContext);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouteProvider");
  }

  return routeContext;
};
