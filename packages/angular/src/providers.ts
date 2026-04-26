import {
  ApplicationRef,
  DestroyRef,
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from "@angular/core";
import { getNavigator, type Router, type Navigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";

import { createScrollRestoration, createViewTransitions } from "./dom-utils";
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
        const sr = createScrollRestoration(router, scrollOpts);

        inject(DestroyRef).onDestroy(() => {
          sr.destroy();
        });
      }),
    );
  }

  if (options?.viewTransitions === true) {
    providers.push(
      provideEnvironmentInitializer(() => {
        const appRef = inject(ApplicationRef);

        // Force synchronous change detection on every transition success
        // BEFORE the VT utility resolves its deferred. The utility uses
        // `setTimeout(0)` to release the new-snapshot capture, which is
        // load-bearing because Chromium blocks rAF callbacks while VT sits
        // in the `update-callback-called` phase. Angular's zoneless CD is
        // rAF-driven by default — without this synchronous tick the new
        // DOM is not committed when the browser captures the new snapshot,
        // so old and new snapshots end up identical and animations finish
        // in ~0 ms with no visible work (the inner-route `products.list ↔
        // products.detail` morph in the example example was the canary).
        // Subscribers fire in registration order; this one runs BEFORE
        // `createViewTransitions` registers its own subscriber,
        // guaranteeing CD completes first.
        const offTick = router.subscribe(() => {
          appRef.tick();
        });

        const vt = createViewTransitions(router);

        inject(DestroyRef).onDestroy(() => {
          offTick();
          vt.destroy();
        });
      }),
    );
  }

  return makeEnvironmentProviders(providers);
}
