import {
  InjectionToken,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from "@angular/core";
import { getNavigator, type Router, type Navigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";

import {
  installScrollRestoration,
  installViewTransitions,
} from "./internal/install";
import { sourceToSignal } from "./sourceToSignal";

import type { ScrollRestorationOptions } from "./dom-utils";
import type { RouteSignals } from "./types";

export const ROUTER = new InjectionToken<Router>("ROUTER");

export const NAVIGATOR = new InjectionToken<Navigator>("NAVIGATOR");

export const ROUTE = new InjectionToken<RouteSignals>("ROUTE");

export interface RealRouterOptions {
  scrollRestoration?: ScrollRestorationOptions;
  viewTransitions?: boolean;
}

export function provideRealRouter(
  router: Router,
  options?: RealRouterOptions,
): EnvironmentProviders {
  const navigator = getNavigator(router);

  const providers: Parameters<typeof makeEnvironmentProviders>[0] = [
    { provide: ROUTER, useValue: router },
    { provide: NAVIGATOR, useValue: navigator },
    {
      provide: ROUTE,
      useFactory: (): RouteSignals => ({
        routeState: sourceToSignal(createRouteSource(router)),
        navigator,
      }),
    },
  ];

  if (options?.scrollRestoration) {
    const scrollOpts = options.scrollRestoration;

    providers.push(
      provideEnvironmentInitializer(() => {
        installScrollRestoration(scrollOpts);
      }),
    );
  }

  if (options?.viewTransitions === true) {
    providers.push(provideEnvironmentInitializer(installViewTransitions));
  }

  return makeEnvironmentProviders(providers);
}
