// packages/react/src/hooks/useRoute.tsx

import { useContext } from "react";

import { RouteContext } from "../context";

import type { RouteContext as RouteContextType } from "../types";
import type { Params } from "@real-router/core";

export const useRoute = <P extends Params = Params>(): RouteContextType<P> => {
  const routeContext = useContext(RouteContext);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouteProvider");
  }

  return routeContext as RouteContextType<P>;
};
