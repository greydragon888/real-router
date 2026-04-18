import { injectOrThrow } from "./injectOrThrow";
import { ROUTE } from "../providers";

import type { RouteSignals } from "../types";
import type { Params } from "@real-router/core";

export function injectRoute<P extends Params = Params>(): RouteSignals<P> {
  return injectOrThrow(ROUTE, "injectRoute") as RouteSignals<P>;
}
