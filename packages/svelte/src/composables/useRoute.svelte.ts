import { ROUTE_KEY, getContextOrThrow } from "../context";

import type { RouteContext } from "../types";
import type { Params } from "@real-router/core";

export const useRoute = <P extends Params = Params>(): RouteContext<P> =>
  getContextOrThrow<RouteContext>(ROUTE_KEY, "useRoute") as RouteContext<P>;
