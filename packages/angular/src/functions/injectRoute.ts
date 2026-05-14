import { assertInInjectionContext } from "@angular/core";

import { injectOrThrow } from "./injectOrThrow";
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

  return signals as NonNullRouteSignals<P>;
}
