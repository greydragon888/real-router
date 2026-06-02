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
  installScrollSpy,
  installViewTransitions,
} from "./internal/install";
import { sourceToSignal } from "./sourceToSignal";

import type { ScrollRestorationOptions, ScrollSpyOptions } from "./dom-utils";
import type { RouteSignals } from "./types";

export const ROUTER = new InjectionToken<Router>("ROUTER");

export const NAVIGATOR = new InjectionToken<Navigator>("NAVIGATOR");

export const ROUTE = new InjectionToken<RouteSignals>("ROUTE");

export interface RealRouterOptions {
  scrollRestoration?: ScrollRestorationOptions;
  scrollSpy?: ScrollSpyOptions;
  viewTransitions?: boolean;
}

export function provideRealRouter(
  router: Router,
  options?: RealRouterOptions,
): EnvironmentProviders {
  const navigator = getNavigator(router);

  // `Parameters<typeof makeEnvironmentProviders>[0]` is the actual union
  // `(Provider | EnvironmentProviders | EnvironmentProviders[])[]` —
  // `provideEnvironmentInitializer()` returns `EnvironmentProviders`, so the
  // narrower `Provider[]` would force a cast at every push (review §8a — the
  // proposed Provider[] swap was retracted after discovering this).
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

  if (options?.scrollSpy && options.scrollSpy.selector !== "") {
    const spyOpts = options.scrollSpy;

    providers.push(
      provideEnvironmentInitializer(() => {
        installScrollSpy(spyOpts);
      }),
    );
  }

  if (options?.viewTransitions === true) {
    providers.push(provideEnvironmentInitializer(installViewTransitions));
  }

  return makeEnvironmentProviders(providers);
}
