import {
  InjectionToken,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from "@angular/core";
import { getNavigator, type Router, type Navigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";

import { sourceToSignal } from "./sourceToSignal";

import type { RouteSignals } from "./types";

export const ROUTER = new InjectionToken<Router>("ROUTER");

export const NAVIGATOR = new InjectionToken<Navigator>("NAVIGATOR");

export const ROUTE = new InjectionToken<RouteSignals>("ROUTE");

export function provideRealRouter(router: Router): EnvironmentProviders {
  const navigator = getNavigator(router);

  return makeEnvironmentProviders([
    { provide: ROUTER, useValue: router },
    { provide: NAVIGATOR, useValue: navigator },
    {
      provide: ROUTE,
      useFactory: (): RouteSignals => ({
        routeState: sourceToSignal(createRouteSource(router)),
        navigator,
      }),
    },
  ]);
}
