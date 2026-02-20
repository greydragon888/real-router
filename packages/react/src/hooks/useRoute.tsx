// packages/react/modules/hooks/useRoute.tsx

import { use } from "react";

import { RouteContext } from "../context";

import type { RouteContext as RouteContextType } from "../types";

export const useRoute = (): RouteContextType => {
  const routeContext = use(RouteContext);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouteProvider");
  }

  return routeContext;
};
