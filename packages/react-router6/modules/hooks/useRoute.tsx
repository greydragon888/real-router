// packages/react-router6/modules/hooks/useRoute.tsx

import { useContext } from "react";

import { RouteContext } from "../context";

import type { RouteContext as RouteContextType } from "../types";

export const useRoute = (): RouteContextType => {
  const routeContext = useContext(RouteContext);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouteProvider");
  }

  return routeContext;
};
