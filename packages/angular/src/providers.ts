import {
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from "@angular/core";
import { getNavigator, type Router } from "@real-router/core";
import { createRouteSource, primeErrorSource } from "@real-router/sources";

import {
  installScrollRestoration,
  installScrollSpy,
  installViewTransitions,
} from "./internal/install";
import { sourceToSignal } from "./sourceToSignal";
import { ROUTER, NAVIGATOR, ROUTE } from "./tokens";

import type { ScrollRestorationOptions, ScrollSpyOptions } from "./dom-utils";
import type { RouteSignals } from "./types";

// Declared in ./tokens (a leaf module) and re-exported here so the public
// surface is unchanged — declaring them in THIS file formed a value cycle
// with internal/install.ts, which injects ROUTER back (#1525).
export { ROUTER, NAVIGATOR, ROUTE } from "./tokens";

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
    // #778 P2: eagerly create the per-router error source at bootstrap so a
    // navigation error that fires BEFORE a RouterErrorBoundary is instantiated
    // (a lazily-rendered shell, a failed boot navigation) is still captured. The
    // boundary's createDismissableError reuses this cached source and catches up
    // (#765); without it the error source is created lazily on boundary init —
    // after the error — and never sees it.
    provideEnvironmentInitializer(() => {
      primeErrorSource(router);
    }),
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
