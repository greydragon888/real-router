import { assertInInjectionContext } from "@angular/core";
import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";

import { sourceToSignal } from "../sourceToSignal";
import { injectRouter } from "./injectRouter";

import type { RouteSignals } from "../types";

export function injectRouteNode(nodeName: string): RouteSignals {
  assertInInjectionContext(injectRouteNode);

  const router = injectRouter();
  const navigator = getNavigator(router);
  const source = createRouteNodeSource(router, nodeName);
  const routeState = sourceToSignal(source);

  return { routeState, navigator };
}
