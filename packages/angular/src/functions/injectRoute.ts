import {
  assertInInjectionContext,
  ChangeDetectorRef,
  DestroyRef,
  inject,
} from "@angular/core";
import { createRouteSource } from "@real-router/sources";

import { injectOrThrow } from "./injectOrThrow";
import { injectRouter } from "./injectRouter";
import { ROUTE } from "../providers";

import type { RouteSignals } from "../types";
import type { Signal } from "@angular/core";
import type { Params, State } from "@real-router/core";
import type { RouteSnapshot } from "@real-router/sources";

type NonNullRouteSignals<P extends Params> = Omit<
  RouteSignals<P>,
  "routeState"
> & {
  readonly routeState: Signal<
    Omit<RouteSnapshot<P>, "route"> & { route: State<P> }
  >;
};

export function injectRoute<
  P extends Params = Params,
>(): NonNullRouteSignals<P> {
  assertInInjectionContext(injectRoute);

  const signals = injectOrThrow(ROUTE, "injectRoute") as RouteSignals<P>;

  // Read the snapshot once: the signal is reactive, but the throw-guard
  // and any future use of the snapshot within this call should observe the
  // SAME value to avoid races.
  const snapshot = signals.routeState();

  if (!snapshot.route) {
    throw new Error(
      "injectRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  // #1466: sync-commit this consumer's route-reactive bindings in the click
  // task. The shared `ROUTE.routeState` signal updates synchronously on every
  // navigation, but a signal read in a template only re-renders on the zoneless
  // scheduler's DEFERRED change-detection flush — a ~0.6-0.9 ms felt-wall gap on
  // route-state displays (`{{ params.id }}`, active-content, route name), the
  // same class the `RouteView` outlet swap hits. The route source notifies
  // synchronously from `router.navigate()` (OUTSIDE Angular CD), so a local
  // `detectChanges()` on the consuming component commits it in-task instead.
  // `createRouteSource` is cached per router (a shared subscription, not a new
  // source); `subscribe` fires on navigations only (not initial), so no
  // in-CD re-entrancy on setup. Optional CDR: `injectRoute` in a non-component
  // (environment) injector keeps its original deferred behaviour. `@angular/router`
  // cannot match this — its route bindings flow through `@Input`/CD.
  const cdr = inject(ChangeDetectorRef, { optional: true });

  if (cdr) {
    const source = createRouteSource(injectRouter());
    const unsub = source.subscribe(() => {
      cdr.detectChanges();
    });

    inject(DestroyRef).onDestroy(() => {
      try {
        unsub();
      } finally {
        source.destroy();
      }
    });
  }

  return signals as NonNullRouteSignals<P>;
}
