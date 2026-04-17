import { ROUTE_KEY, getContextOrThrow } from "../context";

import type { RouteContext } from "../types";

export const useRoute = (): RouteContext =>
  getContextOrThrow<RouteContext>(ROUTE_KEY, "useRoute");
